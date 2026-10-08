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

import asyncio

import pytest

import app.agent.factory.toolkit_assembler as assembler
from app.agent.factory.single_agent import session_title_agent, single_agent
from app.agent.toolkit.depth_limited_agent_toolkit import (
    DepthLimitedAgentToolkit,
)
from app.model.chat import Chat
from app.service.task import Action, TaskLock, task_locks

pytestmark = pytest.mark.unit


def _chat(sample_chat_data: dict, **overrides) -> Chat:
    # Only delegation is switched on: the other toolkits start browsers and
    # terminals, and are covered by the toolkit assembly tests.
    toolkit_config = {
        name: {"enabled": name == "agent"}
        for name in assembler.DEFAULT_SINGLE_AGENT_TOOLKIT_CONFIG
    }
    return Chat(
        **{
            **sample_chat_data,
            "session_mode": "single-agent",
            "installed_mcp": {"mcpServers": {}},
            "toolkit_config": toolkit_config,
            **overrides,
        }
    )


async def _queued_actions(queue: asyncio.Queue) -> list:
    await asyncio.sleep(0.05)  # let scheduled put_queue calls land
    items = []
    while not queue.empty():
        items.append(queue.get_nowait())
    return items


@pytest.fixture
def geo_home(tmp_path, monkeypatch):
    monkeypatch.setenv("EIGENT_GEO_DB_PATH", str(tmp_path / "geo.db"))
    monkeypatch.delenv("GEO_AGENT_WORKING_WINDOW", raising=False)
    monkeypatch.setenv("file_save_path", str(tmp_path))
    return tmp_path


@pytest.mark.asyncio
async def test_a_session_starts_with_the_geo_agent_as_its_only_agent(
    sample_chat_data, monkeypatch, geo_home
):
    options = _chat(sample_chat_data, model_type="gpt-6-sol")
    queue: asyncio.Queue = asyncio.Queue()
    monkeypatch.setitem(
        task_locks, options.project_id, TaskLock(options.project_id, queue, {})
    )

    agent = await single_agent(options)
    session_title_agent(options)

    created = [
        item.data["agent_name"]
        for item in await _queued_actions(queue)
        if item.action == Action.create_agent
    ]
    assert created == ["single_agent"]
    assert agent.role_name == "GEO Agent"
    assert agent.system_message.content.startswith(
        "你是 DingGouGEO 的 GEO Agent"
    )
    # Compaction follows the model's window instead of being switched off.
    assert agent.token_limit == 200_000
    assert agent.summarize_threshold == 80


@pytest.mark.asyncio
async def test_the_root_hands_a_stage_to_that_stage_sub_agent(
    sample_chat_data, monkeypatch, geo_home
):
    options = _chat(sample_chat_data)
    monkeypatch.setitem(
        task_locks,
        options.project_id,
        TaskLock(options.project_id, asyncio.Queue(), {}),
    )
    agent = await single_agent(options)
    toolkit = agent.tool_dict["agent_run_subagent"].func.__self__
    assert isinstance(toolkit, DepthLimitedAgentToolkit)

    child = toolkit._create_subagent("geo-knowledge", "清洗新上传的三份资料")

    prompt = child.system_message.content
    assert prompt.startswith("你是 DingGouGEO 的「品牌知识库」子智能体")
    assert "本次任务：清洗新上传的三份资料" in prompt
    assert child.token_limit == agent.token_limit
    # One level only: the child cannot delegate further.
    assert "agent_run_subagent" not in child.tool_dict
