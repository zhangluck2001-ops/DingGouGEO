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

import pytest

from app.geo import feishu_import, queries, rounds, store


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
                    "probe_group": "NO.1",
                    "capture_round": "第二轮",
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
                    "capture_round": "第二轮",
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


def test_analysis_import_matches_brand_named_fields(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    source = feishu_import.TableSource(
        kind="analysis", table_id="t", round="第二轮"
    )
    row = feishu_import._map_analysis(
        pid,
        source,
        "ana1",
        {
            "采集编码": "RUN_1",
            "是否提及自有品": "是",
            "是否推荐SMA敏护": "条件推荐",
            "SMA敏护的推荐理由": "小分子",
            "SMA敏护推荐理由归类": "S1 | 水解小分子蛋白",
            "未推荐SMA敏护原因": None,
            "提及品牌数量": "3",
            "TOP3": "是",
        },
    )
    assert row["recommend_own"] == "条件推荐"
    assert row["recommend_reason"] == "小分子"
    assert row["reason_selling_points"] == "S1 | 水解小分子蛋白"
    assert row["brand_count"] == 3
    with store.connect() as conn:
        store.upsert_rows(conn, "geo_answer_analysis", [row])
    item = queries.list_records("analyses", pid)["items"][0]
    # Question and platform come from the answer the analysis belongs to.
    assert item["platform"] == "豆包网页端"
    assert item["probe_code"] == "Q001"


def test_content_import_merges_media_placements():
    media = feishu_import._map_content(
        1,
        None,
        "m1",
        {
            "自动编号": "7",
            "媒体平台": "搜狐新闻",
            "文章标题": "稿",
            "网址链接": "https://s.com/x",
        },
    )
    assert (media["channel"], media["account_platform"], media["status"]) == (
        "媒体",
        "搜狐新闻",
        "已发布",
    )
    own = feishu_import._map_content(
        1,
        None,
        "c1",
        {"发布内容标题": "稿", "内容连接": None, "账号平台": "知乎"},
    )
    assert (own["channel"], own["status"]) == ("自媒体", "待发布")


def test_citation_domain_is_derived(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    assert store.url_domain("https://WWW.Example.com/a?b") == "www.example.com"
    created = queries.create_record(
        "citations", pid, {"url": "https://m.zhihu.com/p/1", "title": "t"}
    )
    assert created["domain"] == "m.zhihu.com"


def test_rounds_are_listed_from_captured_rows_in_order(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    with store.connect(pid) as conn:
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    "project_id": pid,
                    "record_id": "old",
                    "capture_code": "RUN_9",
                    "capture_round": "第一轮",
                    "capture_date": "2026-08-28 16:51",
                }
            ],
        )
    listed = queries.list_records("rounds", pid, sort="seq", order="asc")
    assert [(r["name"], r["seq"], r["kind"]) for r in listed["items"]] == [
        ("第一轮", 1, "基线"),
        ("第二轮", 2, "复测"),
    ]
    assert listed["items"][0]["started_on"] == "2026-08-28"
    assert listed["items"][1]["answer_count"] == 3
    facet = queries.list_records("answers", pid)["facets"]["capture_round"]
    assert [f["value"] for f in facet] == ["第一轮", "第二轮"]


def test_new_round_rename_and_delete(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    queries.list_records("rounds", pid)  # picks up 第二轮 from the rows
    third = queries.create_record("rounds", pid, {"note": "优化后复测"})
    assert (third["name"], third["seq"], third["kind"], third["status"]) == (
        "第三轮",
        3,
        "复测",
        "计划中",
    )
    # New captures land in the latest round by default.
    answer = queries.create_record("answers", pid, {"probe_code": "Q002"})
    assert answer["capture_round"] == "第三轮"

    second = next(
        r
        for r in queries.list_records("rounds", pid)["items"]
        if r["name"] == "第二轮"
    )
    queries.update_record("rounds", second["id"], {"name": "第二轮复测"}, pid)
    rounds_used = {
        r["capture_round"]
        for r in queries.list_records("answers", pid)["items"]
    }
    assert rounds_used == {"第二轮复测", "第三轮"}
    assert (
        queries.list_records("citations", pid)["items"][0]["capture_round"]
        == "第二轮复测"
    )

    with pytest.raises(rounds.RoundInUse):
        queries.create_record("rounds", pid, {"name": "第三轮"})
    with pytest.raises(rounds.RoundInUse):
        queries.delete_records("rounds", [second["id"]], pid)


def test_round_names_parse():
    assert rounds.parse_seq("第一轮") == 1
    assert rounds.parse_seq("第十二轮复测") == 12
    assert rounds.parse_seq("第3轮") == 3
    assert rounds.parse_seq("NO.1") is None
    assert rounds.default_name(11) == "第十一轮"
    assert rounds.default_name(20) == "第二十轮"


def test_round_comparison_counts_each_round(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    with store.connect(pid) as conn:
        store.upsert_rows(
            conn,
            "geo_answer_analysis",
            [
                {
                    "project_id": pid,
                    "record_id": "an1",
                    "capture_code": "RUN_1",
                    "capture_round": "第二轮",
                    "mentions_own": "是",
                    "recommend_own": "条件推荐",
                }
            ],
        )
    queries.create_record("rounds", pid, {})
    first, second = queries.round_comparison(pid)
    assert (first["name"], first["answers"], first["citations"]) == (
        "第二轮",
        3,
        1,
    )
    assert first["answers_with_sources"] == 1
    assert (first["mentions_own"], first["recommends_own"]) == (1, 1)
    assert first["cited_contents"] == 1
    assert (second["name"], second["answers"]) == ("第三轮", 0)


def test_gaps_and_benchmarks_are_boards(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    queries.create_record(
        "gaps",
        pid,
        {"scene": "便秘换奶", "gap_type": "未进候选", "evidence": "RUN_1"},
    )
    queries.create_record(
        "benchmarks",
        pid,
        {"title": "十款适度水解奶粉测评", "cited_count": "218"},
    )
    gaps = queries.list_records("gaps", pid)
    assert gaps["items"][0]["scene"] == "便秘换奶"
    # Options are offered before any row uses them.
    statuses = {f["value"] for f in gaps["facets"]["status"]}
    assert statuses == set(queries.GAP_STATUSES)
    assert queries.list_records("benchmarks", pid)["total"] == 1
    roles = {
        f["value"]
        for f in queries.list_records("facts", pid)["facets"]["role"]
    }
    assert {"标准名", "证据锚", "扣分项", "核心事实"} <= roles
