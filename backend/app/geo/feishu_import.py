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

from app.geo import store

logger = logging.getLogger("geo.feishu_import")

PAGE_SIZE = 200

# Feishu text cells that hold a hyperlink come back as Markdown: [label](url).
_MARKDOWN_LINK = re.compile(r"^\[([^\]]*)\]\(([^)\s]+)\)$")


@dataclass
class TableSource:
    kind: str  # answer | citation | content | probe
    table_id: str
    batch: str = ""
    ai_platform: str = ""


@dataclass
class ProjectSource:
    name: str
    base_token: str
    tables: list[TableSource] = field(default_factory=list)


def _sources_path() -> Path:
    return store.geo_db_path().parent / "sources.json"


def load_sources() -> list[ProjectSource]:
    """Feishu Bases to import, from ``~/.eigent/geo/sources.json``.

    Client Base tokens stay in this per-machine file, never in source code.
    Format: ``[{"name", "base_token", "tables": [{"kind", "table_id",
    "batch", "ai_platform"}]}]`` with kind answer/citation/content/probe.
    """
    path = _sources_path()
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [
        ProjectSource(
            name=item["name"],
            base_token=item["base_token"],
            tables=[TableSource(**table) for table in item.get("tables", [])],
        )
        for item in raw
    ]


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
        "round": f.get("抓取轮次"),
        "batch": source.batch,
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
        "batch": source.batch,
        "source_platform": f.get("引用来源平台"),
        "source_type": f.get("来源类型"),
        "title": f.get("来源标题"),
        "url": f.get("来源URL"),
        "capture_date": f.get("来源摘取日期"),
    }


def _map_content(project_id, source, record_id, f):
    url = f.get("内容连接")
    return {
        "project_id": project_id,
        "record_id": record_id,
        "serial": f.get("自动编号"),
        "title": f.get("发布内容标题"),
        "url": url,
        "account_platform": f.get("账号平台"),
        "account_name": f.get("账号名称"),
        "status": "已发布" if url else "待发布",
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
        "note": f.get("备注（F码/风险提示）"),
    }


_MAPPERS: dict[str, tuple[str, Callable]] = {
    "answer": ("geo_answer", _map_answer),
    "citation": ("geo_citation", _map_citation),
    "content": ("geo_content", _map_content),
    "probe": ("geo_probe", _map_probe),
}


def import_project(source: ProjectSource) -> dict[str, int]:
    counts: dict[str, int] = {}
    with store.connect() as conn:
        project_id = store.ensure_project(conn, source.name, source.base_token)
    for table in source.tables:
        target, mapper = _MAPPERS[table.kind]
        with store.connect() as conn:
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
                    with store.connect() as conn:
                        total += store.upsert_rows(conn, target, batch)
                    batch = []
            with store.connect() as conn:
                total += store.upsert_rows(conn, target, batch)
                conn.execute(
                    "UPDATE geo_import_run SET status = 'done', row_count = ?,"
                    " finished_at = datetime('now') WHERE id = ?",
                    (total, run_id),
                )
        except Exception as exc:  # keep importing the other tables
            logger.exception("GEO import failed for %s", table.table_id)
            with store.connect() as conn:
                conn.execute(
                    "UPDATE geo_import_run SET status = 'error', row_count = ?,"
                    " message = ?, finished_at = datetime('now') WHERE id = ?",
                    (total, str(exc)[:500], run_id),
                )
        counts[f"{table.kind}:{table.table_id}"] = total
    return counts


_import_thread: threading.Thread | None = None


def is_import_running() -> bool:
    return _import_thread is not None and _import_thread.is_alive()


def start_import_in_background() -> bool:
    """Start a full import unless one is already running."""
    global _import_thread
    if is_import_running():
        return False

    def run():
        for source in load_sources():
            import_project(source)

    _import_thread = threading.Thread(
        target=run, name="geo-import", daemon=True
    )
    _import_thread.start()
    return True
