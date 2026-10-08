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
"""The instruction a stage page's "hand to AI" button puts in the chat.

Built from the stage's contract (``harness.STAGES``) plus what the Space
holds right now: files still to clean, the round's metrics, open gaps. The
metrics are computed here because the agent can't reach the backend.
"""

from pathlib import Path

from app.geo import harness, knowledge, metrics, rounds, store

_PERCENT_KEYS = (
    ("mention_rate", "提及率"),
    ("first_rate", "首提率"),
    ("top3_rate", "TOP3 率"),
    ("anchor_rate", "证据锚同段率"),
    ("concern_rate", "顾虑率"),
    ("absorbed_rate", "事实吸收率"),
)


class UnknownStage(KeyError):
    pass


def _num(value: int | None) -> str:
    return "—" if value is None else str(value)


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.1f}%"


def render_metrics(result: dict) -> str:
    """One round's metrics as a Markdown table, per platform then overall."""
    head = (
        "| 平台 | 有效回答 | 独立探针 | 已诊断 | 提及 | "
        + " | ".join(label for _, label in _PERCENT_KEYS)
        + " |"
    )
    rows = [head, "|" + "---|" * (5 + len(_PERCENT_KEYS))]
    for name, item in [
        *((p["platform"], p) for p in result["platforms"]),
        ("合计（跨平台，仅作方向参考）", result["overall"]),
    ]:
        rows.append(
            f"| {name} | {item['answers']} | {item['probes']} | "
            f"{item['analysed']} | {_num(item['mentioned'])} | "
            + " | ".join(_pct(item[key]) for key, _ in _PERCENT_KEYS)
            + " |"
        )
    cited = result["cited_content"]
    rows.append(
        f"\n已发布内容 {cited['published']} 篇，其中 {cited['cited_contents']} 篇"
        f"被引用 {cited['citations']} 次，涉及 {cited['answers']} 条回答。"
    )
    return "\n".join(rows)


def _latest_round(project_id: int) -> str | None:
    with store.connect(project_id) as conn:
        # Rounds seen in imported answers are registered on first look.
        rounds.sync(conn, project_id)
        row = conn.execute(
            "SELECT name FROM geo_capture_round WHERE project_id = ?"
            " AND deleted = 0 ORDER BY seq DESC, id DESC LIMIT 1",
            (project_id,),
        ).fetchone()
    return row["name"] if row else None


def _first_round(project_id: int) -> str | None:
    with store.connect(project_id) as conn:
        # Rounds seen in imported answers are registered on first look.
        rounds.sync(conn, project_id)
        row = conn.execute(
            "SELECT name FROM geo_capture_round WHERE project_id = ?"
            " AND deleted = 0 ORDER BY seq, id LIMIT 1",
            (project_id,),
        ).fetchone()
    return row["name"] if row else None


def _count(project_id: int, sql: str, params: tuple) -> int:
    with store.connect(project_id) as conn:
        return conn.execute(sql, params).fetchone()[0]


def _terms_note(terms: dict) -> str:
    if terms["own"]:
        return ""
    return (
        "\n注意：知识库还没有命名条目（role=标准名／别名），提及率等指标算不出来。"
        "先回第 1 环补命名条目，再做这一环。"
    )


def _knowledge(project_id: int, _round: str | None) -> str:
    state = knowledge.status(project_id)
    pending = [s["name"] for s in state["sources"] if s["status"] != "已清洗"]
    files = (
        "\n".join(f"- {name}" for name in pending) or "- （没有待清洗的资料）"
    )
    return (
        f"待清洗的资料：\n{files}\n"
        "写入 `geo_fact` 时：每条写模块、产品、字段、内容、类型（事实／宣称／话术）、"
        "证据等级 A–E、来源（DOI 或官方 URL）。另外补两类条目，后面的诊断和写稿靠它们：\n"
        "- 命名条目：role 填 标准名、首提全称、沿革句、别名、撞名排除，名称写在「内容」里，"
        "多个用 | 分隔；\n"
        "- 指标条目：role 填 核心事实、证据锚、扣分项，匹配词写在「字段」里，多个用 | 分隔，"
        "完整的事实写在「内容」里。\n"
        "每份资料清洗完，把它在 `geo_kb_source` 里的状态改成「已清洗」。原件不改。"
    )


def _probes(_project_id: int, _round: str | None) -> str:
    return (
        "方向：（在这里写你想测的方向）\n"
        "先给我看草稿，我确认后再写入 `geo_probe`（编码、问题、CEP、框架、品牌指向、卖点、"
        "审校状态、真实咨询依据）。"
    )


def _capture(project_id: int, capture_round: str | None) -> str:
    target = capture_round or "（新轮次，先在轮次表里建好）"
    return (
        f"轮次：{target}。采集脚本在应用外跑；把结果文件放进 "
        f"`03_AI采集/{capture_round or '<轮次名>'}/` 后，导入 `geo_answer` 和 "
        "`geo_citation`，capture_round 写轮次名。导入后按完成标准核对，"
        "列出缺少的探针 × 平台。不要在 AI 平台上提问。"
    )


def _analysis(project_id: int, capture_round: str | None) -> str:
    if not capture_round:
        return "还没有采集轮次，先完成第 3 环。"
    result = metrics.round_metrics(project_id, capture_round)
    missing = _count(
        project_id,
        "SELECT COUNT(*) FROM geo_answer a WHERE a.project_id = ?"
        " AND a.capture_round = ? AND a.deleted = 0"
        " AND TRIM(COALESCE(a.answer, '')) != ''"
        " AND NOT EXISTS (SELECT 1 FROM geo_answer_analysis x"
        "  WHERE x.project_id = a.project_id AND x.capture_code = a.capture_code"
        "  AND x.capture_round = a.capture_round AND x.deleted = 0)",
        (project_id, capture_round),
    )
    return (
        f"轮次：{capture_round}。还有 {missing} 条回答没有逐条诊断，先补齐。\n"
        f"本轮指标（后端按统一口径算出，直接引用，不要自己另算）：\n\n"
        f"{render_metrics(result)}\n{_terms_note(result['terms'])}\n"
        "缺口写入 `geo_gap`：场景、缺口类型（未进候选／进了没首推／事实错误／负面顾虑）、"
        "涉及平台、证据回答（采集编码）、优先级、建议内容方向，状态「待处理」。"
        f"本轮结论写到 `04_诊断分析/{capture_round}.md`。"
    )


def _citations(_project_id: int, capture_round: str | None) -> str:
    target = capture_round or "最新一轮"
    return (
        f"轮次：{target}。按平台统计站点和域名排行；挑出高被引原文，抓取正文存到 "
        "`05_引用来源/对标原文/`，写入 `geo_benchmark`（标题、URL、站点、引用平台、"
        "被引次数、篇幅、结构、品牌数、原文存档）；给每个平台写渠道建议。"
    )


def _content(project_id: int, _round: str | None) -> str:
    gaps = _count(
        project_id,
        "SELECT COUNT(*) FROM geo_gap WHERE project_id = ? AND deleted = 0"
        " AND status = '待处理'",
        (project_id,),
    )
    benchmarks = _count(
        project_id,
        "SELECT COUNT(*) FROM geo_benchmark WHERE project_id = ? AND deleted = 0",
        (project_id,),
    )
    return (
        f"待处理的缺口 {gaps} 个，对标库 {benchmarks} 篇。批次名：（在这里写）。\n"
        "每篇先写对标模板卡，再写源稿、发布版（只含 p/strong）和 3 个标题，"
        "存到 `06_内容生产/<批次名>/`；过验收闸门，任一硬项不过不交付。"
        "每篇写一行 `geo_content`：批次、依据轮次、对应缺口、对标原文、目标渠道、"
        "正文文件、验收状态，状态「草稿」；排进生产的缺口改为「已排产」。\n"
        "技能里如果要从采集 jsonl 选对标原文，在这里改用 `geo_benchmark`；"
        "对标库为空时，按 `geo_citation` 里 URL 的被引次数排序来选。"
    )


def _publish(project_id: int, _round: str | None) -> str:
    ready = _count(
        project_id,
        "SELECT COUNT(*) FROM geo_content WHERE project_id = ? AND deleted = 0"
        " AND qc_status = '通过' AND status != '已发布'",
        (project_id,),
    )
    return (
        f"验收通过、还没发布的稿件 {ready} 篇。按平台与 AI 的对应关系写发布计划，"
        "存到 `07_内容发布/<批次名>发布计划.md`。发布由人来做；发完后回填链接、"
        "发布日期，状态改为「已发布」。"
    )


def _tracking(project_id: int, capture_round: str | None) -> str:
    later = capture_round or _latest_round(project_id)
    base = _first_round(project_id)
    if not later or not base or base == later:
        return "至少要有两个采集轮次才能对比。"
    result = metrics.compare_rounds(project_id, base, later)
    parts = [
        f"对比 {base} 和 {later}，只看两轮都测过的 {result['shared_probes']} 个探针"
        "（后端按统一口径算出，直接引用）："
    ]
    for item in result["rounds"]:
        parts.append(f"\n{item['capture_round']}：\n\n{render_metrics(item)}")
    parts.append(_terms_note(result["terms"]))
    parts.append(f"\n阶段报告写到 `08_效果追踪/{later}.md`，写明局限。")
    return "\n".join(parts)


_EXTRA = {
    "knowledge": _knowledge,
    "probes": _probes,
    "capture": _capture,
    "analysis": _analysis,
    "citations": _citations,
    "content": _content,
    "publish": _publish,
    "tracking": _tracking,
}


def stage_task(key: str, project_id: int, capture_round: str | None) -> str:
    stage = harness.stage(key)
    if stage is None:
        raise UnknownStage(key)
    project = store.project_row(project_id)
    if project is None:
        raise LookupError(f"Unknown project: {project_id}")
    db = store.project_db_path(project_id)
    geo = Path(db).parent
    if key in ("analysis",) and not capture_round:
        capture_round = _latest_round(project_id)
    names = harness.stage_skills(stage, project["workspace_root"])
    skills = (
        f"先加载技能：{'、'.join(f'`{s}`' for s in names)}。\n"
        if names
        else ""
    )
    return (
        f"【第 {stage.seq} 环 {stage.name}】{project['name']}\n"
        f"空间 GEO 文件夹：`{geo}`；数据库：`{db}`。\n"
        f"这一环做什么：{stage.duty}\n"
        f"输入：{stage.inputs}\n"
        f"结果写到：{stage.writes}\n"
        f"完成标准：{stage.done}\n"
        f"{skills}"
        f"\n{_EXTRA[key](project_id, capture_round)}\n\n"
        f"开始前先说计划：哪些自己做，哪些派给 `{stage.subagent_type}`；"
        "需要我同意的先问我。做完按完成标准逐条核对并汇报。"
    )
