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

from app.geo import knowledge, queries, space_bootstrap, store


def test_new_space_gets_project_and_pipeline_folders(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    first = space_bootstrap.ensure_space_project(
        "space-1", "雅培小安素", str(workspace)
    )
    assert first["created_project"] is True
    geo = workspace / "GEO"
    assert sorted(p.name for p in geo.iterdir() if p.is_dir()) == [
        folder for folder, _ in space_bootstrap.PIPELINE_FOLDERS
    ]
    rules = geo / "01_品牌知识库" / "00_总览.md"
    rules.write_text("自定义内容", encoding="utf-8")

    again = space_bootstrap.ensure_space_project(
        "space-1", "雅培小安素", str(workspace)
    )
    assert again["project_id"] == first["project_id"]
    assert again["created_paths"] == []
    assert rules.read_text(encoding="utf-8") == "自定义内容"
    projects = queries.list_projects()
    assert [(p["name"], p["space_id"]) for p in projects] == [
        ("雅培小安素", "space-1")
    ]


def test_space_adopts_imported_project_with_same_name(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    with store.connect() as conn:
        imported = store.ensure_project(conn, "SMA敏护", "base")
    result = space_bootstrap.ensure_space_project("space-2", "SMA敏护", None)
    assert result["project_id"] == imported
    assert result["created_paths"] == []


def test_renaming_space_renames_project(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    first = space_bootstrap.ensure_space_project("space-3", "未命名", None)
    renamed = space_bootstrap.ensure_space_project(
        "space-3", "雅培全安素", None
    )
    assert renamed["project_id"] == first["project_id"]
    assert renamed["name"] == "雅培全安素"


def test_knowledge_base_scaffold_status_and_import(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    # A Space set up before the knowledge base existed keeps its files.
    legacy = workspace / "GEO" / "01_品牌资料"
    legacy.mkdir(parents=True)
    (legacy / "品牌规则.md").write_text("旧规则", encoding="utf-8")

    project = space_bootstrap.ensure_space_project(
        "s", "小安素", str(workspace)
    )
    kb = workspace / "GEO" / "01_品牌知识库"
    assert not legacy.exists()
    assert (kb / "品牌规则.md").read_text(encoding="utf-8") == "旧规则"
    assert (kb / "清洗规则.md").is_file()
    assert (kb / "原始资料").is_dir()

    state = knowledge.status(project["project_id"])
    assert [m["key"] for m in state["modules"]][0] == "00_总览"
    assert not any(m["filled"] for m in state["modules"])

    overview = kb / "00_总览.md"
    overview.write_text(
        overview.read_text(encoding="utf-8").replace(
            knowledge.TEMPLATE_MARKER, ""
        ),
        encoding="utf-8",
    )
    pdf = tmp_path / "品牌手册.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    assert knowledge.import_sources(project["project_id"], [str(pdf)]) == [
        "品牌手册.pdf"
    ]
    assert knowledge.import_sources(project["project_id"], [str(pdf)]) == [
        "品牌手册 (2).pdf"
    ]
    knowledge.set_source_status(
        project["project_id"], "品牌手册.pdf", "已清洗"
    )

    state = knowledge.status(project["project_id"])
    assert state["modules"][0]["filled"] is True
    assert {s["name"]: s["status"] for s in state["sources"]} == {
        "品牌手册.pdf": "已清洗",
        "品牌手册 (2).pdf": "待清洗",
    }
    assert pdf.read_bytes() == b"%PDF-1.4"
