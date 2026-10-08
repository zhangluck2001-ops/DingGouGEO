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

import pytest

from app.geo import harness, space_bootstrap


@pytest.fixture
def geo_home(tmp_path, monkeypatch):
    """A per-machine GEO folder with no user model profiles in it."""
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    monkeypatch.delenv("GEO_AGENT_WORKING_WINDOW", raising=False)
    return tmp_path


def test_every_pipeline_folder_has_one_stage_and_sub_agent():
    assert [s.folder for s in harness.STAGES] == [
        folder for folder, _ in space_bootstrap.PIPELINE_FOLDERS
    ]
    assert [s.seq for s in harness.STAGES] == list(range(1, 9))
    types = [s.subagent_type for s in harness.STAGES]
    assert len(set(types)) == len(types)
    assert all(t.startswith("geo-") for t in types)


def test_stage_lookup_ignores_case_and_unknown_types():
    assert harness.stage_for_subagent(" GEO-Analysis ").name == "诊断分析"
    assert harness.stage_for_subagent("general-purpose") is None
    assert harness.stage_for_subagent("") is None


def test_large_windows_are_capped_to_the_working_window(geo_home):
    budget = harness.context_budget("openai", "gpt-6-sol")
    assert budget.context_window == 1_050_000
    assert budget.token_limit == 200_000
    assert budget.summarize_threshold == 80
    # A dated variant shares its model's entry.
    assert (
        harness.context_budget("openai", "GPT-6-Sol-2026-08-01").context_window
        == 1_050_000
    )


def test_models_camel_knows_use_its_window(geo_home):
    budget = harness.context_budget("deepseek", "deepseek-chat")
    assert budget.context_window == budget.token_limit == 128_000


def test_unknown_models_never_get_an_unlimited_budget(geo_home):
    budget = harness.context_budget("some-provider", "model-nobody-listed")
    assert budget.token_limit == 128_000


def test_user_profiles_win_over_the_built_in_ones(geo_home):
    (geo_home / "model_profiles.json").write_text(
        json.dumps(
            {
                "default": {"context_window": 64_000},
                "models": [
                    {"model_type": "gpt-6-sol", "context_window": 90_000},
                    {
                        "model_platform": "azure",
                        "model_type": "my-deploy",
                        "context_window": 150_000,
                    },
                    {"model_type": "broken", "context_window": True},
                ],
            }
        ),
        encoding="utf-8",
    )
    assert harness.context_budget("openai", "gpt-6-sol").token_limit == 90_000
    assert harness.context_budget("azure", "my-deploy").token_limit == 150_000
    # Scoped to another provider, and an invalid entry: both fall through.
    assert harness.context_budget("openai", "my-deploy").token_limit == 64_000
    assert harness.context_budget("openai", "broken").token_limit == 64_000


def test_unreadable_user_profiles_are_ignored(geo_home):
    (geo_home / "model_profiles.json").write_text("{not json", "utf-8")
    assert harness.context_budget("openai", "gpt-6-sol").token_limit == 200_000


def test_working_window_can_be_tuned_per_machine(geo_home, monkeypatch):
    monkeypatch.setenv("GEO_AGENT_WORKING_WINDOW", "400000")
    assert harness.context_budget("openai", "gpt-6-sol").token_limit == 400_000
    monkeypatch.setenv("GEO_AGENT_WORKING_WINDOW", "lots")
    assert harness.context_budget("openai", "gpt-6-sol").token_limit == 200_000


def test_agent_roster_is_the_geo_agent_and_its_stage_agents():
    overview = harness.agents_overview()

    assert overview["root"]["name"] == "GEO Agent"
    tools = overview["root"]["tools"]
    assert {"memory", "file", "terminal", "skill", "agent"} <= set(tools)
    # Upstream coding tools are not part of the GEO Agent.
    assert "workspace_git" not in tools
    assert "planning_worktree" not in tools
    assert [s["subagent_type"] for s in overview["stages"]] == [
        s.subagent_type for s in harness.STAGES
    ]
    assert all(s["skills"] == [] for s in overview["stages"])
