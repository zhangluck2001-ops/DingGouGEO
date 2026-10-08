# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
"""Where a Space stands on each stage of the pipeline.

Each stage gets the parts of its completion criteria (pipeline contract,
``harness.Stage.done``) that can be checked from the database and the stage
folders. A stage is done when every check passes; otherwise the checks say
what is missing. Rounds and batches: the latest of each.
"""

import sqlite3
from pathlib import Path

from app.geo import harness, knowledge, rounds, store

DONE, NOT_DONE = "已完成", "未完成"


def _check(label: str, ok: bool, detail: str = "") -> dict:
    return {"label": label, "ok": bool(ok), "detail": detail}


def _one(conn: sqlite3.Connection, sql: str, params: tuple) -> int:
    return conn.execute(sql, params).fetchone()[0] or 0


def _knowledge(conn, pid, ctx) -> list[dict]:
    kb = ctx["kb"]
    sources = kb["sources"]
    pending = sum(1 for s in sources if s["status"] != "已清洗")
    filled = sum(1 for m in kb["modules"] if m["filled"])
    naming = {
        row["role"]
        for row in conn.execute(
            "SELECT DISTINCT role FROM geo_fact WHERE project_id = ?"
            " AND deleted = 0 AND role IN ('标准名', '首提全称')",
            (pid,),
        )
    }
    facts = _one(
        conn,
        "SELECT COUNT(*) FROM geo_fact WHERE project_id = ? AND deleted = 0",
        (pid,),
    )
    sourced = _one(
        conn,
        "SELECT COUNT(*) FROM geo_fact WHERE project_id = ? AND deleted = 0"
        " AND TRIM(COALESCE(source, '')) != ''",
        (pid,),
    )
    return [
        _check(
            "原始资料都已清洗",
            sources and not pending,
            f"未清洗 {pending}／共 {len(sources)} 份",
        ),
        _check(
            "七个模块都已填写",
            kb["modules"] and filled == len(kb["modules"]),
            f"{filled}／{len(kb['modules'])}",
        ),
        _check(
            "有标准名和首提全称", len(naming) == 2, "、".join(sorted(naming))
        ),
        _check(
            "每条知识都有来源",
            facts and sourced == facts,
            f"{sourced}／{facts} 条",
        ),
    ]


def _probes(conn, pid, _ctx) -> list[dict]:
    core = _one(
        conn,
        "SELECT COUNT(*) FROM geo_probe WHERE project_id = ? AND deleted = 0"
        " AND review_status = '核心探针'",
        (pid,),
    )
    based = _one(
        conn,
        "SELECT COUNT(*) FROM geo_probe WHERE project_id = ? AND deleted = 0"
        " AND review_status = '核心探针' AND TRIM(COALESCE(basis, '')) != ''",
        (pid,),
    )
    return [
        _check("有核心探针", core > 0, f"{core} 条"),
        _check(
            "核心探针都有真实咨询依据",
            core and based == core,
            f"{based}／{core}",
        ),
    ]


def _capture(conn, pid, ctx) -> list[dict]:
    name = ctx["round"]
    if not name:
        return [_check("有采集轮次", False)]
    core = _one(
        conn,
        "SELECT COUNT(*) FROM geo_probe WHERE project_id = ? AND deleted = 0"
        " AND review_status = '核心探针'",
        (pid,),
    )
    platforms = _one(
        conn,
        "SELECT COUNT(DISTINCT platform) FROM geo_answer WHERE project_id = ?"
        " AND capture_round = ? AND deleted = 0",
        (pid, name),
    )
    covered = _one(
        conn,
        "SELECT COUNT(DISTINCT a.probe_code || '|' || a.platform) FROM geo_answer a"
        " JOIN geo_probe p ON p.project_id = a.project_id AND p.code = a.probe_code"
        " AND p.deleted = 0 AND p.review_status = '核心探针'"
        " WHERE a.project_id = ? AND a.capture_round = ? AND a.deleted = 0"
        " AND TRIM(COALESCE(a.answer, '')) != ''",
        (pid, name),
    )
    empty = _one(
        conn,
        "SELECT COUNT(*) FROM geo_answer WHERE project_id = ? AND capture_round = ?"
        " AND deleted = 0 AND TRIM(COALESCE(answer, '')) = ''",
        (pid, name),
    )
    expected = core * platforms
    return [
        _check("有采集轮次", True, name),
        _check(
            "核心探针 × 平台都有回答",
            expected and covered >= expected,
            f"{covered}／{expected}（{platforms} 个平台）",
        ),
        _check("没有空回答", empty == 0, f"{empty} 条"),
    ]


def _analysis(conn, pid, ctx) -> list[dict]:
    name = ctx["round"]
    if not name:
        return [_check("有采集轮次", False)]
    answers = _one(
        conn,
        "SELECT COUNT(*) FROM geo_answer WHERE project_id = ? AND capture_round = ?"
        " AND deleted = 0 AND TRIM(COALESCE(answer, '')) != ''",
        (pid, name),
    )
    analysed = _one(
        conn,
        "SELECT COUNT(*) FROM geo_answer a WHERE a.project_id = ?"
        " AND a.capture_round = ? AND a.deleted = 0"
        " AND TRIM(COALESCE(a.answer, '')) != ''"
        " AND EXISTS (SELECT 1 FROM geo_answer_analysis x"
        "  WHERE x.project_id = a.project_id AND x.capture_code = a.capture_code"
        "  AND x.capture_round = a.capture_round AND x.deleted = 0)",
        (pid, name),
    )
    gaps = _one(
        conn,
        "SELECT COUNT(*) FROM geo_gap WHERE project_id = ? AND deleted = 0"
        " AND capture_round = ?",
        (pid, name),
    )
    report = ctx["geo"] / "04_诊断分析" / f"{name}.md"
    return [
        _check(
            f"{name}每条回答都有诊断",
            answers and analysed == answers,
            f"{analysed}／{answers}",
        ),
        _check("缺口已归纳", gaps > 0, f"{gaps} 个"),
        _check("本轮结论已写", report.is_file(), f"04_诊断分析/{name}.md"),
    ]


def _citations(conn, pid, ctx) -> list[dict]:
    benchmarks = _one(
        conn,
        "SELECT COUNT(*) FROM geo_benchmark WHERE project_id = ? AND deleted = 0",
        (pid,),
    )
    name = ctx["round"] or "<轮次名>"
    report = ctx["geo"] / "05_引用来源" / f"{name}.md"
    return [
        _check("对标库有原文", benchmarks > 0, f"{benchmarks} 篇"),
        _check("渠道建议已写", report.is_file(), f"05_引用来源/{name}.md"),
    ]


def _content(conn, pid, ctx) -> list[dict]:
    batch = ctx["batch"]
    if not batch:
        return [_check("有内容批次", False, "内容表里还没有带批次的稿件")]
    total = _one(
        conn,
        "SELECT COUNT(*) FROM geo_content WHERE project_id = ? AND deleted = 0"
        " AND batch = ?",
        (pid, batch),
    )
    passed = _one(
        conn,
        "SELECT COUNT(*) FROM geo_content WHERE project_id = ? AND deleted = 0"
        " AND batch = ? AND qc_status = '通过'",
        (pid, batch),
    )
    return [
        _check("有内容批次", True, batch),
        _check(
            "本批全部通过验收闸门",
            total and passed == total,
            f"{passed}／{total}",
        ),
    ]


def _publish(conn, pid, ctx) -> list[dict]:
    batch = ctx["batch"]
    if not batch:
        return [_check("有可发布的批次", False)]
    rows = conn.execute(
        "SELECT status, url, published_on FROM geo_content WHERE project_id = ?"
        " AND deleted = 0 AND batch = ? AND qc_status = '通过'",
        (pid, batch),
    ).fetchall()
    published = [r for r in rows if r["status"] == "已发布"]
    complete = [r for r in published if r["url"] and r["published_on"]]
    return [
        _check(
            "本批通过验收的都已发布",
            rows and len(published) == len(rows),
            f"{len(published)}／{len(rows)}",
        ),
        _check(
            "已发布的都有链接和日期",
            published and len(complete) == len(published),
            f"{len(complete)}／{len(published)}",
        ),
    ]


def _tracking(conn, pid, ctx) -> list[dict]:
    count = _one(
        conn,
        "SELECT COUNT(*) FROM geo_capture_round WHERE project_id = ? AND deleted = 0",
        (pid,),
    )
    name = ctx["round"] or "<轮次名>"
    report = ctx["geo"] / "08_效果追踪" / f"{name}.md"
    return [
        _check("至少有两个采集轮次", count >= 2, f"{count} 个"),
        _check("阶段报告已写", report.is_file(), f"08_效果追踪/{name}.md"),
    ]


_CHECKS = {
    "knowledge": _knowledge,
    "probes": _probes,
    "capture": _capture,
    "analysis": _analysis,
    "citations": _citations,
    "content": _content,
    "publish": _publish,
    "tracking": _tracking,
}


def pipeline_status(project_id: int) -> dict:
    project = store.project_row(project_id)
    if project is None:
        raise LookupError(f"Unknown project: {project_id}")
    kb = knowledge.status(project_id)
    db = store.project_db_path(project_id)
    with store.connect(project_id) as conn:
        rounds.sync(conn, project_id)
        latest = conn.execute(
            "SELECT name FROM geo_capture_round WHERE project_id = ?"
            " AND deleted = 0 ORDER BY seq DESC, id DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        batch = conn.execute(
            "SELECT batch FROM geo_content WHERE project_id = ? AND deleted = 0"
            " AND TRIM(COALESCE(batch, '')) != '' ORDER BY id DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        ctx = {
            "kb": kb,
            "geo": Path(db).parent,
            "round": latest["name"] if latest else None,
            "batch": batch["batch"] if batch else None,
        }
        stages = []
        for stage in harness.STAGES:
            checks = _CHECKS[stage.key](conn, project_id, ctx)
            passed = sum(1 for c in checks if c["ok"])
            stages.append(
                {
                    "key": stage.key,
                    "seq": stage.seq,
                    "name": stage.name,
                    "state": DONE if passed == len(checks) else NOT_DONE,
                    "passed": passed,
                    "checks": checks,
                }
            )
    return {
        "capture_round": ctx["round"],
        "batch": ctx["batch"],
        "stages": stages,
    }
