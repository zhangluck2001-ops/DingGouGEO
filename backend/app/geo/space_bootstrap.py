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
"""Turn a Space into a GEO brand project.

Every Space a person creates is one brand (or product) project: it gets a
row in the project registry (linked by ``space_id``) and a ``GEO/`` folder in
the Space's workspace that holds everything for the brand — one sub-folder
per stage of the GEO pipeline and the brand's database ``geo.db``. All steps
are idempotent and never overwrite files.
"""

from pathlib import Path

from app.geo import knowledge, rounds, store

GEO_ROOT_FOLDER = store.GEO_ROOT_FOLDER

# (folder, what goes in it) — ordered like the pipeline in the workbench.
PIPELINE_FOLDERS: tuple[tuple[str, str], ...] = (
    (
        "01_品牌知识库",
        "品牌知识库：原始资料（PDF/Word 原件）→ 按清洗规则整理成 00–06 七个模块。唯一事实依据，AI 生产内容前先读这里。",
    ),
    ("02_意图探针", "问题探针题库（求推荐型、非品牌指向）与审校记录。"),
    (
        "03_AI采集",
        "各 AI 平台逐题采集的回答、分享链接和采集日志，每个采集轮次一个子文件夹（第一轮 = 优化前基线，之后每次优化后复测一轮）。",
    ),
    (
        "04_诊断分析",
        "逐条回答的诊断标注（是否提及、首推品牌、TOP3、推荐理由、情感、风险）与各轮诊断结论。",
    ),
    ("05_引用来源", "回答里被引用的来源明细、来源站点排行与投放渠道建议。"),
    ("06_内容生产", "按诊断缺口生产的底稿、多标题变体和质检记录。"),
    ("07_内容发布", "各平台发布记录：标题、账号、链接、发布日期。"),
    ("08_效果追踪", "轮次对比、被 AI 引用的稿件、阶段报告。"),
)

# Folders renamed when 诊断分析 became its own stage (old → new). Renamed
# latest-first so no new name collides with an old one still in place.
_RENAMED_FOLDERS: tuple[tuple[str, str], ...] = (
    ("07_效果追踪", "08_效果追踪"),
    ("06_内容发布", "07_内容发布"),
    ("05_内容生产", "06_内容生产"),
    ("04_引用来源", "05_引用来源"),
)

_README = """# {name} · GEO 工作目录

这个文件夹由 DingGouGEO 在建立空间时自动生成，这个品牌的 GEO 链路全部放在这里：

- `geo.db` — 本空间的数据库：知识条目、探针、采集轮次、回答、诊断分析、引用来源、内容记录。
  工作台左侧 GEO 链路里查看和编辑的就是它；智能体每一步的结果也直接写回这里。
- 各环节文件夹：

{folders}

## 采集轮次

同一套探针会反复采集：第一轮是优化前的基线，之后每做一轮内容优化就再采一轮复测（第二轮、第三轮……）。
每条回答、引用来源、回答分析都记在某个采集轮次下（字段 `capture_round`），轮次清单在表 `geo_capture_round`。
探针由使用者自己放进来、自己增删改，每轮采哪些探针也由使用者选。
"""


def scaffold_folders(workspace_root: str, name: str) -> list[str]:
    """Create the GEO pipeline folders; returns the paths that were created."""
    root = Path(workspace_root).expanduser()
    if not root.is_dir():
        return []
    geo_root = root / GEO_ROOT_FOLDER
    geo_root.mkdir(exist_ok=True)
    # Knowledge base first: it may rename a legacy 01_品牌资料 folder.
    created: list[str] = knowledge.scaffold(geo_root, name)
    for old, new in _RENAMED_FOLDERS:
        if (geo_root / old).is_dir() and not (geo_root / new).exists():
            (geo_root / old).rename(geo_root / new)
    for folder, _ in PIPELINE_FOLDERS:
        path = geo_root / folder
        if not path.exists():
            path.mkdir(parents=True)
            created.append(str(path))
    readme = geo_root / "README.md"
    # Regenerate READMEs written for an older folder layout (shared database,
    # no 诊断分析 stage); ones people rewrote lack the generated first line.
    old_text = readme.read_text(encoding="utf-8") if readme.exists() else ""
    stale = "由 DingGouGEO 在建立空间时自动生成" in old_text and (
        "`~/.eigent/geo/geo.db`" in old_text or "04_诊断分析" not in old_text
    )
    if not readme.exists() or stale:
        folders = "\n".join(
            f"- `{folder}/` — {desc}" for folder, desc in PIPELINE_FOLDERS
        )
        readme.write_text(
            _README.format(name=name, folders=folders), encoding="utf-8"
        )
        created.append(str(readme))
    return created


# SQLite writes these next to the Space database on every read. When the
# Space folder is under Workspace version control they would look like edits
# made during an agent's command and quarantine it ("Workspace operation is
# still active or needs attention"), blocking every later Terminal command.
_GIT_EXCLUDE_MARKER = "# DingGouGEO: SQLite runtime files"
_GIT_EXCLUDE_RULES = (
    f"{GEO_ROOT_FOLDER}/*.db-wal",
    f"{GEO_ROOT_FOLDER}/*.db-shm",
    f"{GEO_ROOT_FOLDER}/*.db-journal",
    f"{GEO_ROOT_FOLDER}/*.db.bak-*",
    f"{GEO_ROOT_FOLDER}/*.db.before-merge-*",
)


def exclude_database_files_from_git(workspace_root: str) -> bool:
    """Keep the database's runtime files out of the Space's Git checkpoints.

    Uses ``.git/info/exclude`` so nothing is added to the Space's own files.
    Returns True when rules were added.
    """
    info = Path(workspace_root).expanduser() / ".git" / "info"
    if not info.is_dir():
        return False
    exclude = info / "exclude"
    current = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
    if _GIT_EXCLUDE_MARKER in current:
        return False
    block = "\n".join((_GIT_EXCLUDE_MARKER, *_GIT_EXCLUDE_RULES))
    exclude.write_text(
        f"{current.rstrip()}\n\n{block}\n" if current else f"{block}\n",
        encoding="utf-8",
    )
    return True


def ensure_space_project(
    space_id: str, name: str, workspace_root: str | None
) -> dict:
    """Link (or create) the GEO project for a Space and scaffold its folder.

    An existing unlinked project with the same name — e.g. one imported from
    Feishu before the Space existed — is adopted instead of duplicated.
    """
    name = name.strip() or space_id
    with store.registry() as conn:
        row = conn.execute(
            "SELECT id, name FROM geo_project WHERE space_id = ?", (space_id,)
        ).fetchone()
        if row is None:
            row = conn.execute(
                "SELECT id, name FROM geo_project"
                " WHERE name = ? AND (space_id IS NULL OR space_id = '')",
                (name,),
            ).fetchone()
        if row is None:
            taken = conn.execute(
                "SELECT 1 FROM geo_project WHERE name = ?", (name,)
            ).fetchone()
            project_name = f"{name} ({space_id[:6]})" if taken else name
            project_id = int(
                conn.execute(
                    "INSERT INTO geo_project (name, space_id, workspace_root)"
                    " VALUES (?, ?, ?)",
                    (project_name, space_id, workspace_root),
                ).lastrowid
            )
            created_project = True
        else:
            project_id = int(row["id"])
            # Follow Space renames, unless another project already has the name.
            if (
                row["name"] != name
                and not conn.execute(
                    "SELECT 1 FROM geo_project WHERE name = ? AND id != ?",
                    (name, project_id),
                ).fetchone()
            ):
                conn.execute(
                    "UPDATE geo_project SET name = ? WHERE id = ?",
                    (name, project_id),
                )
            conn.execute(
                "UPDATE geo_project SET space_id = ?,"
                " workspace_root = COALESCE(?, workspace_root) WHERE id = ?",
                (space_id, workspace_root, project_id),
            )
            created_project = False
        project_name = conn.execute(
            "SELECT name FROM geo_project WHERE id = ?", (project_id,)
        ).fetchone()["name"]
    created_paths = (
        scaffold_folders(workspace_root, project_name)
        if workspace_root
        else []
    )
    moved: dict[str, int] = {}
    if workspace_root:
        exclude_database_files_from_git(workspace_root)
    if created_paths or workspace_root:
        # A project imported before its Space existed moves into the Space.
        moved = store.move_project_into_space(project_id)
        with store.connect(project_id) as conn:
            round_names = [
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM geo_capture_round"
                    " WHERE project_id = ? AND deleted = 0",
                    (project_id,),
                ).fetchall()
            ] + rounds.sync(conn, project_id)
        for round_name in round_names:
            rounds.ensure_folder(project_id, round_name)
    return {
        "project_id": project_id,
        "name": project_name,
        "space_id": space_id,
        "workspace_root": workspace_root,
        "created_project": created_project,
        "created_paths": created_paths,
        "db_path": str(store.project_db_path(project_id)),
        "moved_rows": moved,
    }
