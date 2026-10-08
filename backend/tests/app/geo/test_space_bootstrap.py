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

import json

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


def test_space_keeps_its_data_in_its_own_folder(tmp_path, monkeypatch):
    registry = tmp_path / "registry" / "geo.db"
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(registry))
    # Imported from Feishu before any Space existed: data sits in the registry.
    with store.connect() as conn:
        pid = store.ensure_project(conn, "SMA敏护", "base")
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    "project_id": pid,
                    "record_id": "r1",
                    "capture_code": "RUN_1",
                    "capture_round": "第一轮",
                }
            ],
        )
    (registry.parent / "sources.json").write_text(
        json.dumps(
            [
                {
                    "name": "SMA敏护",
                    "base_token": "base",
                    "tables": [
                        {"kind": "answer", "table_id": "t1", "batch": "第一轮"}
                    ],
                }
            ]
        ),
        encoding="utf-8",
    )
    workspace = tmp_path / "space"
    workspace.mkdir()
    result = space_bootstrap.ensure_space_project(
        "space-9", "SMA敏护", str(workspace)
    )
    assert result["project_id"] == pid
    assert result["moved_rows"]["geo_answer"] == 1
    geo = workspace / "GEO"
    assert result["db_path"] == str(geo / "geo.db")
    assert (geo / "03_AI采集" / "第一轮").is_dir()
    # Feishu is an optional import, not part of a Space.
    assert not (geo / "feishu_sources.json").exists()

    with store.connect() as conn:  # the registry keeps only the project row
        assert (
            conn.execute("SELECT COUNT(*) FROM geo_answer").fetchone()[0] == 0
        )
    assert list(registry.parent.glob("geo.db.bak-*"))
    answers = queries.list_records("answers", pid)
    assert [a["capture_code"] for a in answers["items"]] == ["RUN_1"]
    [project] = queries.list_projects()
    assert project["counts"]["answers"] == 1
    assert project["counts"]["rounds"] == 1

    # A second brand Space has its own, empty database.
    other = tmp_path / "space-b"
    other.mkdir()
    brand_b = space_bootstrap.ensure_space_project(
        "space-b", "小安素", str(other)
    )
    assert queries.list_records("answers", brand_b["project_id"])["total"] == 0
    assert (other / "GEO" / "geo.db").is_file()


def test_history_under_another_name_merges_into_the_space(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "reg" / "geo.db"))
    with store.connect() as conn:
        old = store.ensure_project(conn, "SMA敏护", "base-token")
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    "project_id": old,
                    "record_id": "r1",
                    "capture_code": "RUN_1",
                    "capture_round": "第一轮",
                }
            ],
        )
    workspace = tmp_path / "space"
    workspace.mkdir()
    space = space_bootstrap.ensure_space_project(
        "space-1", "雀巢SMA敏护", str(workspace)
    )
    assert space["project_id"] != old  # different name: not adopted

    moved = store.merge_project_into(old, space["project_id"])

    assert moved["geo_answer"] == 1
    [project] = queries.list_projects()
    assert (project["name"], project["counts"]["answers"]) == (
        "雀巢SMA敏护",
        1,
    )
    assert store.project_row(space["project_id"])["feishu_base_token"] == (
        "base-token"
    )
    assert store.project_row(old) is None
    answers = queries.list_records("answers", space["project_id"])["items"]
    assert [a["capture_code"] for a in answers] == ["RUN_1"]


def test_database_runtime_files_are_kept_out_of_workspace_git(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    (workspace / ".git" / "info").mkdir(parents=True)
    exclude = workspace / ".git" / "info" / "exclude"
    exclude.write_text("# git default\n", encoding="utf-8")

    space_bootstrap.ensure_space_project("s", "品牌", str(workspace))
    space_bootstrap.ensure_space_project("s", "品牌", str(workspace))

    text = exclude.read_text(encoding="utf-8")
    assert text.startswith("# git default\n")
    assert text.count("GEO/*.db-wal") == 1 and "GEO/*.db-shm" in text
    # Spaces without version control are left alone.
    plain = tmp_path / "plain"
    plain.mkdir()
    assert space_bootstrap.exclude_database_files_from_git(str(plain)) is False
