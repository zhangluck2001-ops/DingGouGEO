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

from app.geo import pipeline_status, space_bootstrap, store


def _stages(pid):
    return {
        s["key"]: s for s in pipeline_status.pipeline_status(pid)["stages"]
    }


def test_a_new_space_has_every_stage_to_do(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    (tmp_path / "space").mkdir()
    pid = space_bootstrap.ensure_space_project(
        "s1", "品牌", str(tmp_path / "space")
    )["project_id"]
    stages = _stages(pid)
    assert list(stages) == [
        "knowledge",
        "probes",
        "capture",
        "analysis",
        "citations",
        "content",
        "publish",
        "tracking",
    ]
    assert all(s["state"] == "未完成" for s in stages.values())
    knowledge = stages["knowledge"]["checks"]
    assert [c["label"] for c in knowledge][1] == "七个模块都已填写"
    assert knowledge[1]["detail"] == "0／7"


def test_checks_follow_the_data(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    pid = space_bootstrap.ensure_space_project("s1", "品牌", str(workspace))[
        "project_id"
    ]
    p = {"project_id": pid}
    with store.connect(pid) as conn:
        store.upsert_rows(
            conn,
            "geo_probe",
            [
                {
                    **p,
                    "record_id": "p1",
                    "code": "Q1",
                    "review_status": "核心探针",
                    "basis": "客服第3行",
                }
            ],
        )
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    **p,
                    "record_id": f"a{i}",
                    "capture_code": f"R{i}",
                    "probe_code": "Q1",
                    "platform": platform,
                    "capture_round": "第一轮",
                    "capture_date": "2026-08-28",
                    "answer": "回答",
                }
                for i, platform in enumerate(("豆包网页端", "Qwen网页端"))
            ],
        )
        store.upsert_rows(
            conn,
            "geo_answer_analysis",
            [
                {
                    **p,
                    "record_id": "x0",
                    "capture_code": "R0",
                    "capture_round": "第一轮",
                }
            ],
        )
        store.upsert_rows(
            conn,
            "geo_content",
            [
                {
                    **p,
                    "record_id": "c1",
                    "batch": "第二十批",
                    "qc_status": "通过",
                    "status": "已发布",
                    "url": "https://a.cn/1",
                    "published_on": "2026-10-09",
                },
                {
                    **p,
                    "record_id": "c2",
                    "batch": "第二十批",
                    "qc_status": "未通过",
                    "status": "草稿",
                    "url": None,
                    "published_on": None,
                },
            ],
        )
    (workspace / "GEO" / "04_诊断分析" / "第一轮.md").write_text(
        "结论", encoding="utf-8"
    )
    stages = _stages(pid)

    assert stages["probes"]["state"] == "已完成"
    assert stages["capture"]["state"] == "已完成"
    analysis = {c["label"]: c for c in stages["analysis"]["checks"]}
    assert analysis["第一轮每条回答都有诊断"]["detail"] == "1／2"
    assert analysis["本轮结论已写"]["ok"]
    assert stages["analysis"]["passed"] == 1
    content = {c["label"]: c for c in stages["content"]["checks"]}
    assert content["本批全部通过验收闸门"]["detail"] == "1／2"
    # Only the piece that passed the gate is expected to be published.
    assert stages["publish"]["state"] == "已完成"
