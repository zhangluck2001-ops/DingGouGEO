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
"""Brand knowledge base: the first stage of the GEO pipeline.

Each Space (brand) keeps its knowledge base in ``GEO/01_品牌知识库``:
untouched uploads in ``原始资料/``, the cleaning rules, and seven module
files generated from the team's cleaning template. Cleaned facts are also
rows in ``geo_fact`` so boards and the agent can query them.
"""

import re
import shutil
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from app.geo import store

KB_FOLDER = "01_品牌知识库"
LEGACY_KB_FOLDER = "01_品牌资料"
RAW_FOLDER = "原始资料"
PRODUCT_FOLDER = "02_产品库"
RULES_FILE = "清洗规则.md"
TEMPLATE_MARKER = "<!-- DingGouGEO 模板：按清洗规则填写后删除本行 -->"
SOURCE_STATUSES = ("待清洗", "清洗中", "已清洗")

_TEMPLATE_PATH = (
    Path(__file__).parent / "templates" / "brand_kb_cleaning_rules.md"
)

# (module key, file shown in the board, template section heading)
MODULES: tuple[tuple[str, str, str], ...] = (
    ("00_总览", "00_总览.md", "文件 00_总览.md"),
    ("01_品牌实体", "01_品牌实体.md", "文件 01_品牌实体.md"),
    (
        "02_产品库",
        f"{PRODUCT_FOLDER}/_SKU模板.md",
        "文件 02_产品库/[SKU名].md",
    ),
    ("03_资质合规", "03_资质合规.md", "文件 03_资质合规.md"),
    ("04_FAQ", "04_FAQ.md", "文件 04_FAQ.md"),
    ("05_竞品对比", "05_竞品对比.md", "文件 05_竞品对比.md"),
    ("06_合规红线", "06_合规红线.md", "文件 06_合规红线.md"),
)


def cleaning_rules() -> str:
    return _TEMPLATE_PATH.read_text(encoding="utf-8")


@lru_cache(maxsize=1)
def _module_templates() -> dict[str, str]:
    """Pull each module's ```markdown block out of the cleaning template."""
    text = cleaning_rules()
    templates: dict[str, str] = {}
    for key, _, heading in MODULES:
        start = text.find(f"## {heading}")
        if start < 0:
            continue
        block = re.search(r"```markdown\n(.*?)\n```", text[start:], re.S)
        if block:
            templates[key] = block.group(1)
    return templates


def _module_body(key: str, brand: str) -> str:
    body = _module_templates().get(key, f"# {key}\n")
    body = body.replace("[品牌名]", brand)
    lines = body.split("\n", 1)
    rest = lines[1] if len(lines) > 1 else ""
    return f"{lines[0]}\n\n{TEMPLATE_MARKER}\n{rest}\n"


def kb_root(workspace_root: str) -> Path:
    return Path(workspace_root).expanduser() / "GEO" / KB_FOLDER


def scaffold(geo_root: Path, brand: str) -> list[str]:
    """Create the knowledge-base folder, rules, and module templates.

    A Space scaffolded before the knowledge base existed has
    ``01_品牌资料``; it is renamed so nothing already in it is lost.
    """
    created: list[str] = []
    root = geo_root / KB_FOLDER
    legacy = geo_root / LEGACY_KB_FOLDER
    if not root.exists() and legacy.is_dir():
        legacy.rename(root)
    for folder in (root / RAW_FOLDER, root / PRODUCT_FOLDER):
        if not folder.exists():
            folder.mkdir(parents=True)
            created.append(str(folder))
    rules = root / RULES_FILE
    if not rules.exists():
        rules.write_text(cleaning_rules(), encoding="utf-8")
        created.append(str(rules))
    for key, relative, _ in MODULES:
        path = root / relative
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(_module_body(key, brand), encoding="utf-8")
            created.append(str(path))
    return created


def _project(project_id: int) -> dict:
    with store.connect() as conn:
        row = conn.execute(
            "SELECT id, name, workspace_root FROM geo_project WHERE id = ?",
            (project_id,),
        ).fetchone()
    if row is None:
        raise LookupError("GEO project not found")
    return dict(row)


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp).isoformat(timespec="seconds")


def status(project_id: int) -> dict:
    project = _project(project_id)
    workspace_root = project["workspace_root"]
    if not workspace_root:
        return {
            "project_id": project_id,
            "root": None,
            "modules": [],
            "sources": [],
        }
    root = kb_root(workspace_root)
    # Spaces set up before the knowledge base existed are upgraded in place.
    if Path(workspace_root).expanduser().is_dir():
        scaffold(root.parent, project["name"])
    modules = []
    for key, relative, _ in MODULES:
        path = root / relative
        exists = path.is_file()
        text = path.read_text(encoding="utf-8") if exists else ""
        extra_products = (
            sorted(
                p.name
                for p in (root / PRODUCT_FOLDER).glob("*.md")
                if not p.name.startswith("_")
            )
            if key == "02_产品库" and (root / PRODUCT_FOLDER).is_dir()
            else []
        )
        modules.append(
            {
                "key": key,
                "path": str(path),
                "exists": exists,
                "filled": bool(extra_products)
                or (exists and TEMPLATE_MARKER not in text),
                "products": extra_products,
                "modified_at": _iso(path.stat().st_mtime) if exists else None,
            }
        )
    with store.connect() as conn:
        known = {
            row["file_name"]: dict(row)
            for row in conn.execute(
                "SELECT file_name, status, imported_at, cleaned_at"
                " FROM geo_kb_source WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        }
        fact_count = conn.execute(
            "SELECT COUNT(*) FROM geo_fact WHERE project_id = ? AND deleted = 0",
            (project_id,),
        ).fetchone()[0]
    sources = []
    raw = root / RAW_FOLDER
    if raw.is_dir():
        for path in sorted(raw.iterdir(), key=lambda p: p.name):
            if not path.is_file() or path.name.startswith("."):
                continue
            record = known.get(path.name, {})
            sources.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "size": path.stat().st_size,
                    "status": record.get("status", "待清洗"),
                    "imported_at": record.get("imported_at")
                    or _iso(path.stat().st_mtime),
                    "cleaned_at": record.get("cleaned_at"),
                }
            )
    return {
        "project_id": project_id,
        "root": str(root),
        "rules_path": str(root / RULES_FILE),
        "raw_path": str(raw),
        "modules": modules,
        "sources": sources,
        "fact_count": fact_count,
    }


def _free_name(folder: Path, name: str) -> Path:
    target = folder / name
    stem, suffix = Path(name).stem, Path(name).suffix
    index = 2
    while target.exists():
        target = folder / f"{stem} ({index}){suffix}"
        index += 1
    return target


def import_sources(project_id: int, paths: list[str]) -> list[str]:
    """Copy picked files into 原始资料 without touching the originals."""
    project = _project(project_id)
    if not project["workspace_root"]:
        raise LookupError("This Space has no local folder yet")
    raw = kb_root(project["workspace_root"]) / RAW_FOLDER
    raw.mkdir(parents=True, exist_ok=True)
    imported: list[str] = []
    with store.connect() as conn:
        for item in paths:
            source = Path(item).expanduser()
            if not source.is_file():
                continue
            target = _free_name(raw, source.name)
            shutil.copy2(source, target)
            conn.execute(
                "INSERT INTO geo_kb_source (project_id, file_name, size)"
                " VALUES (?, ?, ?) ON CONFLICT(project_id, file_name)"
                " DO UPDATE SET status = '待清洗', cleaned_at = NULL",
                (project_id, target.name, target.stat().st_size),
            )
            imported.append(target.name)
    return imported


def set_source_status(project_id: int, file_name: str, value: str) -> None:
    if value not in SOURCE_STATUSES:
        raise ValueError(f"status must be one of {SOURCE_STATUSES}")
    with store.connect() as conn:
        conn.execute(
            "INSERT INTO geo_kb_source (project_id, file_name, status, cleaned_at)"
            " VALUES (?, ?, ?, CASE WHEN ? = '已清洗' THEN datetime('now') END)"
            " ON CONFLICT(project_id, file_name) DO UPDATE SET"
            " status = excluded.status, cleaned_at = excluded.cleaned_at",
            (project_id, file_name, value, value),
        )
