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

import time

from app.geo import (
    agent_prompt,
    harness,
    queries,
    space_bootstrap,
    store,
)


def test_space_status_describes_the_space(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    project = space_bootstrap.ensure_space_project(
        "space-1", "雅培小安素", str(workspace)
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
                    "capture_round": "第一轮",
                    "capture_date": "2026-08-28 10:00",
                }
                for i in range(2)
            ],
        )
    queries.create_record("probes", pid, {"text": "哪款奶粉好"})

    status = agent_prompt.space_status("space-1")
    assert "品牌项目：雅培小安素" in status
    assert str(workspace / "GEO" / "geo.db") in status
    assert "已填写 0/7 个模块" in status
    assert "意图探针：1 条" in status
    assert (
        "第一轮（基线，已完成，2026-08-28 – 2026-08-28）：回答 2 条" in status
    )


def test_space_status_is_empty_without_a_project(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    assert agent_prompt.space_status("missing") == ""
    assert agent_prompt.space_status(None) == ""


def test_system_prompt_is_the_geo_agent():
    prompt = agent_prompt.build_system_prompt(
        platform_system="Darwin",
        platform_machine="arm64",
        working_directory="/w",
        now_str="2026-09-29",
    )
    assert prompt.startswith("你是 DingGouGEO 的 GEO Agent")
    assert "01_品牌知识库" in prompt and "geo-database" in prompt
    assert "<toolchain_preflight>" in prompt


def test_system_prompt_tells_the_root_how_to_delegate_each_stage():
    prompt = agent_prompt.build_system_prompt(
        platform_system="Darwin",
        platform_machine="arm64",
        working_directory="/w",
        now_str="2026-09-30",
    )
    assert "agent_run_subagent" in prompt
    for stage in harness.STAGES:
        assert f"| {stage.seq} {stage.name} |" in prompt
        assert f"`{stage.subagent_type}`" in prompt
    # Nothing left for str.format to fill in.
    assert "{stage_table}" not in prompt and "{fact_rules}" not in prompt


def test_stage_sub_agent_gets_its_stage_and_the_shared_rules():
    prompt = agent_prompt.build_subagent_prompt(
        "geo-analysis", "诊断第一轮 {豆包} 回答"
    )
    assert prompt.startswith("你是 DingGouGEO 的「诊断分析」子智能体")
    assert "本次任务：诊断第一轮 {豆包} 回答" in prompt
    assert "geo_answer_analysis" in prompt
    # It cannot see the root's prompt, so it carries the same rules.
    assert agent_prompt._FACT_RULES in prompt
    assert agent_prompt._DATA_RULES in prompt
    assert "不要再创建或派发子智能体" in prompt


def test_other_sub_agent_types_keep_the_generic_prompt():
    assert agent_prompt.build_subagent_prompt("research", "x") is None


def test_session_title_prompt_carries_the_message_and_limits():
    prompt = agent_prompt.session_title_prompt(
        "帮我诊断 {第一轮}", name_max=80, summary_max=240
    )
    assert "帮我诊断 {第一轮}" in prompt
    assert "不超过 80 个字符" in prompt and "不超过 240 个字符" in prompt
    assert "标题|摘要" in prompt


def test_reading_the_status_leaves_the_database_untouched(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    workspace = tmp_path / "space"
    workspace.mkdir()
    space_bootstrap.ensure_space_project("space-1", "品牌", str(workspace))
    agent_prompt.space_status("space-1")
    files = [workspace / "GEO" / name for name in ("geo.db", "geo.db-wal")]

    def snapshot():
        # Same bytes rewritten still bump the modification time, which is
        # what the workspace change tracker notices.
        return [f.stat().st_mtime_ns if f.exists() else None for f in files]

    before = snapshot()
    time.sleep(0.02)
    store._initialized_paths.clear()  # as after a backend restart
    agent_prompt.space_status("space-1")
    agent_prompt.space_status("space-1")
    assert snapshot() == before
