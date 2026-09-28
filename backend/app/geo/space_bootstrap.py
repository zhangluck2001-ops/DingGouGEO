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

Every Space a person creates is one brand project: it gets a row in
``geo_project`` (linked by ``space_id``) and a ``GEO/`` folder in the Space's
workspace with one sub-folder per stage of the GEO pipeline. Both steps are
idempotent and never overwrite files.
"""

from pathlib import Path

from app.geo import knowledge, store

GEO_ROOT_FOLDER = "GEO"

# (folder, what goes in it) — ordered like the pipeline in the workbench.
PIPELINE_FOLDERS: tuple[tuple[str, str], ...] = (
    (
        "01_品牌知识库",
        "品牌知识库：原始资料（PDF/Word 原件）→ 按清洗规则整理成 00–06 七个模块。唯一事实依据，AI 生产内容前先读这里。",
    ),
    ("02_意图探针", "问题探针题库（求推荐型、非品牌指向）与审校记录。"),
    ("03_AI采集", "各 AI 平台逐题采集的回答、分享链接和采集日志。"),
    ("04_引用来源", "回答里被引用的来源明细与来源平台分析。"),
    ("05_内容生产", "按探针缺口生产的底稿、多标题变体和质检记录。"),
    ("06_内容发布", "各平台发布记录：标题、账号、链接、发布日期。"),
    ("07_效果追踪", "复测对比、被 AI 引用的稿件、阶段报告。"),
)

_README = """# {name} · GEO 工作目录

这个文件夹由 DingGouGEO 在建立空间时自动生成，对应 GEO 链路的每个环节。
结构化数据（知识条目、探针、回答、引用来源、内容记录）存在本地数据库
`~/.eigent/geo/geo.db` 的项目「{name}」下，工作台左侧 GEO 分组里可以查看和编辑；
这里放对应环节的文件。

{folders}
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
    for folder, _ in PIPELINE_FOLDERS:
        path = geo_root / folder
        if not path.exists():
            path.mkdir(parents=True)
            created.append(str(path))
    readme = geo_root / "README.md"
    if not readme.exists():
        folders = "\n".join(
            f"- `{folder}/` — {desc}" for folder, desc in PIPELINE_FOLDERS
        )
        readme.write_text(
            _README.format(name=name, folders=folders), encoding="utf-8"
        )
        created.append(str(readme))
    return created


def ensure_space_project(
    space_id: str, name: str, workspace_root: str | None
) -> dict:
    """Link (or create) the GEO project for a Space and scaffold its folder.

    An existing unlinked project with the same name — e.g. one imported from
    Feishu before the Space existed — is adopted instead of duplicated.
    """
    name = name.strip() or space_id
    with store.connect() as conn:
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
    return {
        "project_id": project_id,
        "name": project_name,
        "space_id": space_id,
        "workspace_root": workspace_root,
        "created_project": created_project,
        "created_paths": created_paths,
    }
