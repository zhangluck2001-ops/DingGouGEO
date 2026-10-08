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
"""Import GEO tables from a Feishu Base into the local SQLite store.

Reads through the ``lark-cli`` binary that is already signed in on this
machine, so no Feishu credentials are handled here.
"""

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from app.geo import rounds, store

logger = logging.getLogger("geo.feishu_import")

PAGE_SIZE = 200

# Feishu text cells that hold a hyperlink come back as Markdown: [label](url).
_MARKDOWN_LINK = re.compile(r"^\[([^\]]*)\]\(([^)\s]+)\)$")


@dataclass
class TableSource:
    kind: str  # answer | analysis | citation | content | probe
    table_id: str
    # Capture round the table holds (第一轮, 第二轮, …) for answer, analysis,
    # and citation tables; Feishu keeps one table per round.
    round: str = ""
    ai_platform: str = ""

    @classmethod
    def from_json(cls, item: dict) -> "TableSource":
        return cls(
            kind=item["kind"],
            table_id=item["table_id"],
            round=item.get("round") or item.get("batch") or "",
            ai_platform=item.get("ai_platform") or "",
        )


@dataclass
class ProjectSource:
    name: str
    base_token: str
    tables: list[TableSource] = field(default_factory=list)


SPACE_SOURCES_FILE = "feishu_sources.json"


def _global_sources_path() -> Path:
    return store.registry_path().parent / "sources.json"


def space_sources_path(workspace_root: str) -> Path:
    return (
        Path(workspace_root).expanduser()
        / store.GEO_ROOT_FOLDER
        / SPACE_SOURCES_FILE
    )


def _parse(item: dict, name: str) -> ProjectSource:
    return ProjectSource(
        name=item.get("name") or name,
        base_token=item["base_token"],
        tables=[TableSource.from_json(t) for t in item.get("tables", [])],
    )


def load_sources(project_id: int) -> ProjectSource | None:
    """The Feishu Base a project syncs from.

    A Space keeps it in ``GEO/feishu_sources.json`` (``{"base_token",
    "tables": [{"kind", "table_id", "round", "ai_platform"}]}`` with kind
    answer/analysis/citation/content/probe). Projects without one fall back
    to their entry, by name, in the per-machine ``~/.eigent/geo/sources.json``
    list. Client Base tokens stay in these files, never in source code.
    """
    project = store.project_row(project_id)
    if project is None:
        return None
    root = project["workspace_root"]
    if root:
        path = space_sources_path(root)
        if path.is_file():
            return _parse(
                json.loads(path.read_text(encoding="utf-8")), project["name"]
            )
    path = _global_sources_path()
    if not path.exists():
        return None
    for item in json.loads(path.read_text(encoding="utf-8")):
        if item.get("name") == project["name"]:
            return _parse(item, project["name"])
    return None


def copy_sources_into_space(project_id: int) -> bool:
    """Give a Space its own copy of the machine-wide Feishu entry."""
    project = store.project_row(project_id)
    root = project and project["workspace_root"]
    if not root or not Path(root).expanduser().is_dir():
        return False
    target = space_sources_path(root)
    source = load_sources(project_id)
    if target.exists() or source is None:
        return False
    target.write_text(
        json.dumps(
            {
                "name": source.name,
                "base_token": source.base_token,
                "tables": [vars(table) for table in source.tables],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return True


def _lark_cli() -> str:
    found = shutil.which("lark-cli")
    if found:
        return found
    for candidate in ("/opt/homebrew/bin/lark-cli", "/usr/local/bin/lark-cli"):
        if os.path.exists(candidate):
            return candidate
    raise RuntimeError("lark-cli not found; install and sign in first")


def _cell(value) -> str | None:
    """Flatten Feishu cell values (select lists, lookups, links) to text."""
    if value is None:
        return None
    if isinstance(value, str):
        match = _MARKDOWN_LINK.match(value.strip())
        return match.group(2) if match else value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in ("text", "link", "name", "value"):
            if value.get(key):
                return _cell(value[key])
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        parts = [_cell(item) for item in value]
        return "、".join(part for part in parts if part) or None
    return str(value)


def _fetch_table(base_token: str, table_id: str):
    """Yield (record_id, {field_name: text}) for every row in a table."""
    cli = _lark_cli()
    env = {
        **os.environ,
        "PATH": f"/opt/homebrew/bin:/usr/local/bin:{os.environ.get('PATH', '')}",
    }
    offset = 0
    while True:
        proc = subprocess.run(
            [
                cli,
                "base",
                "+record-list",
                "--base-token",
                base_token,
                "--table-id",
                table_id,
                "--format",
                "json",
                "--limit",
                str(PAGE_SIZE),
                "--offset",
                str(offset),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())
        payload = json.loads(proc.stdout)
        data = payload.get("data") or {}
        fields = data.get("fields") or []
        rows = data.get("data") or []
        for record_id, row in zip(data.get("record_id_list") or [], rows):
            yield (
                record_id,
                {name: _cell(value) for name, value in zip(fields, row)},
            )
        if not data.get("has_more") or not rows:
            break
        offset += len(rows)


def _map_answer(project_id, source, record_id, f):
    return {
        "project_id": project_id,
        "record_id": record_id,
        "capture_code": f.get("采集编码"),
        "probe_code": f.get("探针单值编码"),
        "probe_text": f.get("问题探针文本"),
        "platform": f.get("AI平台"),
        # Feishu's 抓取轮次 (NO.1–NO.5) is the probe group, not the round.
        "probe_group": f.get("抓取轮次"),
        "capture_round": source.round,
        "capture_date": f.get("抓取日期"),
        "account": f.get("采集账号"),
        "answer": f.get("AI回答"),
        "web_search": f.get("是否触发联网"),
        "share_url": f.get("分享对话链接"),
        "keywords": f.get("关键词"),
        "category_word": f.get("品类词"),
        "brand_pointer": f.get("品牌指向"),
    }


def _map_citation(project_id, source, record_id, f):
    return {
        "project_id": project_id,
        "record_id": record_id,
        "run_id": f.get("运行ID"),
        "probe_code": f.get("探针单值编码"),
        "ai_platform": source.ai_platform,
        "capture_round": source.round,
        "source_platform": f.get("引用来源平台"),
        "source_type": f.get("来源类型"),
        "title": f.get("来源标题"),
        "url": f.get("来源URL"),
        "domain": store.url_domain(f.get("来源URL")),
        "capture_date": f.get("来源摘取日期"),
    }


def _map_content(project_id, source, record_id, f):
    # Two layouts share this table: self-media accounts (内容发布表) and
    # paid media placements (媒体内容发布), which have no account name.
    is_media = "媒体平台" in f
    url = f.get("网址链接") if is_media else f.get("内容连接")
    return {
        "project_id": project_id,
        "record_id": record_id,
        "serial": f.get("自动编号"),
        "title": f.get("文章标题") if is_media else f.get("发布内容标题"),
        "url": url,
        "channel": "媒体" if is_media else "自媒体",
        "account_platform": f.get("媒体平台")
        if is_media
        else f.get("账号平台"),
        "account_name": None if is_media else f.get("账号名称"),
        "status": "已发布" if url else "待发布",
    }


def _pick(f: dict, match: Callable[[str], bool]) -> str | None:
    """First non-empty value whose field name matches.

    Analysis tables name some fields after the brand (是否推荐SMA敏护,
    SMA敏护的推荐理由), so those are found by pattern, not exact name.
    """
    for name, value in f.items():
        if match(name) and value:
            return value
    return None


def _to_int(value: str | None) -> int | None:
    try:
        return int(float(value)) if value else None
    except ValueError:
        return None


def _map_analysis(project_id, source, record_id, f):
    return {
        "project_id": project_id,
        "record_id": record_id,
        "capture_code": f.get("采集编码"),
        "capture_round": source.round,
        "mentions_own": f.get("是否提及自有品"),
        "mentioned_brands": f.get("提及品牌"),
        "brand_count": _to_int(f.get("提及品牌数量")),
        "top_brand": f.get("首推品牌"),
        "own_in_top3": f.get("TOP3"),
        "recommend_own": _pick(f, lambda n: n.startswith("是否推荐")),
        "recommend_reason": _pick(f, lambda n: n.endswith("的推荐理由")),
        "reason_selling_points": _pick(
            f, lambda n: n.endswith("推荐理由归类")
        ),
        "not_recommend_reason": _pick(
            f, lambda n: n.startswith("未推荐") and n.endswith("原因")
        ),
        "competitor_relation": f.get("竞品同框关系"),
        "sentiment": f.get("AI情感分析"),
        "risk_tags": f.get("风险/限制提醒"),
    }


def _map_probe(project_id, source, record_id, f):
    return {
        "project_id": project_id,
        "record_id": record_id,
        "code": f.get("探针单值编码"),
        "text": f.get("问题探针文本"),
        "category_word": f.get("品类词"),
        "direction": f.get("方向"),
        "brand_pointer": f.get("品牌指向"),
        "review_status": f.get("本轮审校状态"),
        "cep": f.get("CEP品类切入点"),
        "framework": f.get("框架"),
        "selling_points": f.get("卖点"),
        "no_go": f.get("NO_GO"),
        "panel": f.get("panel"),
        "note": f.get("备注（F码/风险提示）"),
    }


_MAPPERS: dict[str, tuple[str, Callable]] = {
    "answer": ("geo_answer", _map_answer),
    "analysis": ("geo_answer_analysis", _map_analysis),
    "citation": ("geo_citation", _map_citation),
    "content": ("geo_content", _map_content),
    "probe": ("geo_probe", _map_probe),
}


def import_project(project_id: int, source: ProjectSource) -> dict[str, int]:
    counts: dict[str, int] = {}
    with store.registry() as conn:
        conn.execute(
            "UPDATE geo_project SET feishu_base_token = ? WHERE id = ?",
            (source.base_token, project_id),
        )
    for table in source.tables:
        target, mapper = _MAPPERS[table.kind]
        with store.connect(project_id) as conn:
            run_id = conn.execute(
                "INSERT INTO geo_import_run (project_id, source, table_id, status)"
                " VALUES (?, ?, ?, 'running')",
                (project_id, table.kind, table.table_id),
            ).lastrowid
        total = 0
        try:
            batch: list[dict] = []
            for record_id, fields in _fetch_table(
                source.base_token, table.table_id
            ):
                batch.append(mapper(project_id, table, record_id, fields))
                if len(batch) >= 500:
                    with store.connect(project_id) as conn:
                        total += store.upsert_rows(conn, target, batch)
                    batch = []
            with store.connect(project_id) as conn:
                total += store.upsert_rows(conn, target, batch)
                conn.execute(
                    "UPDATE geo_import_run SET status = 'done', row_count = ?,"
                    " finished_at = datetime('now') WHERE id = ?",
                    (total, run_id),
                )
        except Exception as exc:  # keep importing the other tables
            logger.exception("GEO import failed for %s", table.table_id)
            with store.connect(project_id) as conn:
                conn.execute(
                    "UPDATE geo_import_run SET status = 'error', row_count = ?,"
                    " message = ?, finished_at = datetime('now') WHERE id = ?",
                    (total, str(exc)[:500], run_id),
                )
        counts[f"{table.kind}:{table.table_id}"] = total
    with store.connect(project_id) as conn:
        rounds.sync(conn, project_id)
    return counts


_import_threads: dict[int, threading.Thread] = {}


def is_import_running(project_id: int) -> bool:
    thread = _import_threads.get(project_id)
    return thread is not None and thread.is_alive()


def start_import_in_background(project_id: int) -> bool:
    """Sync one project from its Feishu Base unless that's already running.

    Raises LookupError when the project has no Feishu source configured.
    """
    if is_import_running(project_id):
        return False
    source = load_sources(project_id)
    if source is None:
        raise LookupError("这个空间还没有配置飞书数据源")

    thread = threading.Thread(
        target=import_project,
        args=(project_id, source),
        name=f"geo-import-{project_id}",
        daemon=True,
    )
    _import_threads[project_id] = thread
    thread.start()
    return True
