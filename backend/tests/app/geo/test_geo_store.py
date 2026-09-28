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

from app.geo import feishu_import, queries, store


def _seed(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    with store.connect() as conn:
        pid = store.ensure_project(conn, "Demo", "base")
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    "project_id": pid,
                    "record_id": f"rec{i}",
                    "capture_code": f"RUN_{i}",
                    "probe_code": "Q001",
                    "probe_text": "有哪些适度水解奶粉推荐",
                    "platform": "豆包网页端" if i % 2 else "Qwen网页端",
                    "round": "NO.1",
                    "batch": "第二轮",
                    "answer": "回答",
                }
                for i in range(3)
            ],
        )
        store.upsert_rows(
            conn,
            "geo_citation",
            [
                {
                    "project_id": pid,
                    "record_id": "cit1",
                    "run_id": "RUN_1",
                    "batch": "第二轮",
                    "url": "https://example.com/a",
                    "title": "A",
                }
            ],
        )
        store.upsert_rows(
            conn,
            "geo_content",
            [
                {
                    "project_id": pid,
                    "record_id": "c1",
                    "serial": "1",
                    "title": "榜单稿",
                    "url": "https://example.com/a",
                    "status": "已发布",
                },
                {
                    "project_id": pid,
                    "record_id": "c2",
                    "serial": "2",
                    "title": "草稿",
                    "url": None,
                    "status": "待发布",
                },
            ],
        )
    return pid


def test_markdown_link_cells_are_unwrapped():
    assert (
        feishu_import._cell("[https://a.b/c](https://a.b/c)")
        == "https://a.b/c"
    )
    assert feishu_import._cell(["豆包网页端"]) == "豆包网页端"
    assert feishu_import._cell(None) is None


def test_upsert_is_idempotent_and_filters_work(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    _seed(tmp_path, monkeypatch)  # re-import must not duplicate
    result = queries.list_records(
        "answers", pid, {"platform": "豆包网页端"}, None
    )
    assert result["total"] == 1
    assert result["items"][0]["citation_count"] == 1
    assert {f["value"] for f in result["facets"]["platform"]} == {
        "豆包网页端",
        "Qwen网页端",
    }


def test_search_matches_capture_code_and_detail_joins_citations(
    tmp_path, monkeypatch
):
    pid = _seed(tmp_path, monkeypatch)
    items = queries.list_records("answers", pid, None, "RUN_1")["items"]
    detail = queries.get_record("answers", items[0]["id"])
    assert [c["url"] for c in detail["citations"]] == ["https://example.com/a"]


def test_local_edits_and_deletes_survive_resync(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    rows = queries.list_records("contents", pid, None, None, "serial", "asc")
    first, second = rows["items"]
    queries.update_record("contents", first["id"], {"title": "改过的标题"})
    queries.delete_records("contents", [second["id"]])
    _seed(tmp_path, monkeypatch)
    after = queries.list_records("contents", pid)["items"]
    assert [(r["title"], r["local_edited"]) for r in after] == [
        ("改过的标题", 1)
    ]


def test_create_record_and_dashboard(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    created = queries.create_record(
        "contents", pid, {"title": "新稿", "status": "草稿", "bogus": "x"}
    )
    assert created["title"] == "新稿" and created["local_edited"] == 1
    board = queries.dashboard(pid)
    assert board["totals"]["contents"] == 3
    assert board["totals"]["cited_contents"] == 1
    assert {
        r["label"]: r["value"] for r in board["charts"]["contents_by_status"]
    } == {
        "已发布": 1,
        "待发布": 1,
        "草稿": 1,
    }
    statuses = {
        f["value"]
        for f in queries.list_records("contents", pid)["facets"]["status"]
    }
    assert {"草稿", "待发布", "已发布"} <= statuses
