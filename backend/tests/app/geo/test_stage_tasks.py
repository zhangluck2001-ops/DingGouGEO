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

from pathlib import Path

import pytest

from app.geo import harness, metrics, space_bootstrap, stage_tasks, store


@pytest.fixture
def space(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    project = space_bootstrap.ensure_space_project(
        "s1", "雀巢SMA敏护", str(workspace)
    )
    pid = project["project_id"]
    with store.connect(pid) as conn:
        store.upsert_rows(
            conn,
            "geo_answer",
            [
                {
                    "project_id": pid,
                    "record_id": f"a{i}",
                    "capture_code": f"RUN_{i}",
                    "probe_code": "Q1",
                    "platform": "豆包网页端",
                    "capture_round": "第一轮",
                    "capture_date": "2026-08-28 10:00",
                    "answer": "推荐 SMA敏护" if i else "推荐超启能恩",
                }
                for i in range(2)
            ],
        )
    return pid


def test_every_stage_has_a_task_built_from_its_contract(space):
    for stage in harness.STAGES:
        text = stage_tasks.stage_task(stage.key, space, None)
        assert text.startswith(
            f"【第 {stage.seq} 环 {stage.name}】雀巢SMA敏护"
        )
        assert f"完成标准：{stage.done}" in text
        assert f"`{stage.subagent_type}`" in text
        assert str(Path("GEO") / "geo.db") in text


def test_analysis_task_carries_the_rounds_metrics(space):
    text = stage_tasks.stage_task("analysis", space, None)
    # The latest round is picked when none is given; both answers lack a
    # diagnosis.
    assert "轮次：第一轮。还有 2 条回答没有逐条诊断" in text
    assert "| 豆包网页端 | 2 | 1 | 0 | — |" in text
    # Without naming entries, mentions are unknown and the task says so.
    assert "先回第 1 环补命名条目" in text


def test_mentions_are_unknown_without_naming_entries(space):
    overall = metrics.round_metrics(space, "第一轮")["overall"]
    assert overall["mentioned"] is None and overall["mention_rate"] is None
    with store.connect(space) as conn:
        store.upsert_rows(
            conn,
            "geo_fact",
            [
                {
                    "project_id": space,
                    "record_id": "f1",
                    "role": "标准名",
                    "content": "SMA敏护",
                }
            ],
        )
    overall = metrics.round_metrics(space, "第一轮")["overall"]
    assert overall["mentioned"] == 1 and overall["mention_rate"] == 0.5


def test_unknown_stage_is_refused(space):
    with pytest.raises(stage_tasks.UnknownStage):
        stage_tasks.stage_task("nope", space, None)


def test_a_space_adds_its_own_skills_to_a_stage(space, tmp_path):
    (tmp_path / "space" / "GEO" / "stage_skills.json").write_text(
        '{"content": ["sma-geo"], "analysis": "not a list"}', encoding="utf-8"
    )
    assert "先加载技能：`sma-geo`。" in stage_tasks.stage_task(
        "content", space, None
    )
    assert "先加载技能" not in stage_tasks.stage_task("analysis", space, None)
    # The roster shows the stage's own skills, which fit every Space.
    content = next(
        s for s in harness.agents_overview()["stages"] if s["key"] == "content"
    )
    assert content["skills"] == []


def test_knowledge_task_lists_the_picked_files_with_their_parsed_text(space):
    project = store.project_row(space)
    raw = (
        Path(project["workspace_root"]) / "GEO" / "01_品牌知识库" / "原始资料"
    )
    (raw / "品牌介绍.md").write_text("SMA 源于惠氏", encoding="utf-8")
    (raw / "其他.md").write_text("不处理", encoding="utf-8")

    text = stage_tasks.stage_task("knowledge", space, None, ["品牌介绍.md"])

    parsed = raw.parent / "原始资料解析" / "品牌介绍.md" / "内容.md"
    assert parsed.is_file()
    assert f"读这个：`{parsed}`" in text
    assert "其他.md" not in text
    # The click is the go-ahead: the agent must not ask again or decode files.
    assert "不用再问" in text
    assert "需要我同意的先问我" not in text
    assert "不要自己写程序解析原件" in text
    # Stage work runs in the root agent's own loop.
    assert "不派子智能体" in text
    assert "agent_run_subagent" not in text
