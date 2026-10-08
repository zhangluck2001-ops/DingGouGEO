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

from app.geo import metrics, store


def _row(i, **values):
    return {"record_id": f"r{i}", **values}


def _fact(i, project, role=None, field=None, content=None):
    # upsert_rows takes its columns from the first row: give every row all.
    return _row(i, **project, role=role, field=field, content=content)


def _seed(tmp_path, monkeypatch):
    """Two platforms, two rounds; probe Q3 only in the later round."""
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    with store.connect() as conn:
        pid = store.ensure_project(conn, "Demo", "base")
        p = {"project_id": pid}
        store.upsert_rows(
            conn,
            "geo_probe",
            [
                _row(f"p{c}", **p, code=c, review_status=status)
                for c, status in (
                    ("Q1", "核心探针"),
                    ("Q2", "核心探针"),
                    ("Q3", "核心探针"),
                    ("Q9", "暂停使用"),
                )
            ],
        )
        store.upsert_rows(
            conn,
            "geo_fact",
            [
                _fact("f1", p, role="标准名", content="SMA敏护"),
                _fact("f2", p, role="别名", content="SMA|SMA Advanced"),
                _fact("f3", p, role="撞名排除", content="托菲儿敏护"),
                _fact("f4", p, role="证据锚", field="GINI|Bosheva"),
                _fact("f5", p, role="扣分项", field="跨境"),
                _fact("f6", p, role="核心事实", field="0.286"),
                _fact("f7", p, content="没有角色的普通事实"),
            ],
        )
        answers = [
            # round 1
            ("第一轮", "a1", "Q1", "豆包网页端", "推荐超启能恩、SMA敏护。"),
            ("第一轮", "a2", "Q2", "Qwen网页端", "推荐超启能恩、托菲儿敏护。"),
            ("第一轮", "a3", "Q9", "Qwen网页端", "SMA敏护（不在核心探针里）"),
            # round 2
            (
                "第二轮",
                "b1",
                "Q1",
                "豆包网页端",
                "1. SMA敏护：GINI 研究支持。\n2. 超启能恩。\n跨境购买",
            ),
            (
                "第二轮",
                "b2",
                "Q2",
                "Qwen网页端",
                "SMA Advanced 每克 0.286 元。",
            ),
            ("第二轮", "b3", "Q3", "Qwen网页端", "超启能恩。GINI 研究。"),
            ("第二轮", "b4", "Q2", "豆包网页端", "   "),
        ]
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                _row(
                    code,
                    **p,
                    capture_round=rnd,
                    capture_code=code,
                    probe_code=probe,
                    platform=platform,
                    answer=text,
                )
                for rnd, code, probe, platform, text in answers
            ],
        )
        store.upsert_rows(
            conn,
            "geo_answer_analysis",
            [
                _row(
                    f"x{code}",
                    **p,
                    capture_round=rnd,
                    capture_code=code,
                    mentioned_brands=brands,
                    own_in_top3=top3,
                )
                for rnd, code, brands, top3 in (
                    ("第一轮", "a1", "超启能恩、SMA敏护", "是"),
                    ("第一轮", "a2", "超启能恩、托菲儿敏护", "否"),
                    ("第二轮", "b1", "SMA敏护、超启能恩", "是"),
                    ("第二轮", "b2", "雀巢SMA Advanced", "是"),
                )
            ],
        )
        store.upsert_rows(
            conn,
            "geo_content",
            [
                _row(
                    "c1",
                    **p,
                    status="已发布",
                    url="https://www.example.com/a/1/?utm=x",
                ),
                _row("c2", **p, status="草稿", url="https://example.com/b"),
            ],
        )
        store.upsert_rows(
            conn,
            "geo_citation",
            [
                _row(
                    "s1",
                    **p,
                    capture_round="第二轮",
                    run_id="b1",
                    url="http://example.com/a/1",
                ),
                _row(
                    "s2",
                    **p,
                    capture_round="第二轮",
                    run_id="b3",
                    url="https://example.com/a/1#top",
                ),
                _row(
                    "s3",
                    **p,
                    capture_round="第二轮",
                    run_id="b3",
                    url="https://example.com/b",
                ),
            ],
        )
    return pid


def test_knowledge_terms_come_from_fact_roles(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    with store.connect(pid) as conn:
        terms = metrics.knowledge_terms(conn, pid)
    assert terms["own"] == ["SMA", "SMA Advanced", "SMA敏护"]
    assert terms["exclude"] == ["托菲儿敏护"]
    assert terms["anchor"] == ["Bosheva", "GINI"]
    assert terms["concern"] == ["跨境"]
    assert terms["absorbed"] == ["0.286"]


def test_round_metrics_follow_the_contract(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    result = metrics.round_metrics(pid, "第二轮")
    overall = result["overall"]

    # Blank answers and non-core probes don't count.
    assert overall["answers"] == 3
    assert overall["probes"] == 3
    # Mention is read from the text: b1 and b2, not b3.
    assert overall["mentioned"] == 2
    assert overall["mention_rate"] == round(2 / 3, 4)
    # TOP3 and first mention come from the diagnosis (b1, b2 analysed).
    assert overall["analysed"] == 2
    assert overall["top3"] == 2
    assert overall["first"] == 2
    # GINI is in SMA's paragraph in b1; in b3 there is no SMA at all.
    assert overall["anchor"] == 1
    assert overall["anchor_rate"] == 0.5
    assert overall["concern"] == 1
    assert overall["absorbed"] == 1
    platforms = {p["platform"]: p for p in result["platforms"]}
    assert platforms["Qwen网页端"]["answers"] == 2
    assert platforms["豆包网页端"]["answers"] == 1
    # The published URL is cited twice, in two answers; the draft doesn't count.
    assert result["cited_content"] == {
        "published": 1,
        "cited_contents": 1,
        "citations": 2,
        "answers": 2,
    }


def test_a_colliding_name_is_not_us(tmp_path, monkeypatch):
    pid = _seed(tmp_path, monkeypatch)
    first_round = metrics.round_metrics(pid, "第一轮")["overall"]
    # a2 names 托菲儿敏护 only; a3 is a paused probe.
    assert first_round["answers"] == 2
    assert first_round["mentioned"] == 1
    # a1 lists SMA second.
    assert first_round["first"] == 0


def test_rounds_are_compared_on_the_probes_both_measured(
    tmp_path, monkeypatch
):
    pid = _seed(tmp_path, monkeypatch)
    result = metrics.compare_rounds(pid, "第一轮", "第二轮")
    assert result["shared_probes"] == 2
    later = result["rounds"][1]["overall"]
    # Q3 (b3) was only asked in round 2, so it is left out.
    assert later["answers"] == 2
    assert later["mentioned"] == 2


def test_urls_are_normalised():
    assert metrics.normalize_url("https://www.Example.com/a/1/?x=1#f") == (
        "example.com/a/1"
    )
    assert metrics.normalize_url("example.com/a/1") == "example.com/a/1"
    assert metrics.normalize_url("") == ""
