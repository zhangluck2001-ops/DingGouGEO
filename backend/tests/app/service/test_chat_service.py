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
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.model.chat import Chat
from app.model.enums import DEFAULT_SUMMARY_PROMPT
from app.service.chat_service import (
    _run_agent_step,
    _summarize_single_agent_task,
    normalize_summary_task,
    step_solve,
)

pytestmark = pytest.mark.unit


class _StreamMsg:
    def __init__(self, content="", reasoning_content=""):
        self.content = content
        self.reasoning_content = reasoning_content


class _StreamChunk:
    def __init__(self, msg=None, msgs=None):
        self.msg = msg
        self.msgs = msgs


class _AgentStepResponse:
    def __init__(self, content: str):
        self.msg = None
        self.msgs = [MagicMock(content=content)]


def test_default_completion_prompt_requires_concrete_deliverables():
    assert "entire final report" in DEFAULT_SUMMARY_PROMPT
    assert "workspace-relative paths" in DEFAULT_SUMMARY_PROMPT
    assert "Validation performed" in DEFAULT_SUMMARY_PROMPT
    assert "one-line acknowledgement" in DEFAULT_SUMMARY_PROMPT


def test_normalize_summary_task_limits_name_and_summary():
    result = normalize_summary_task(
        ("Long Task Name " * 20) + "|" + ("Long summary text " * 40),
        "fallback",
    )
    name, summary = result.split("|", 1)
    assert len(name) <= 80
    assert len(summary) <= 240
    assert name.endswith("...")
    assert summary.endswith("...")


@pytest.mark.asyncio
async def test_sync_agent_step_does_not_block_the_event_loop():
    agent = MagicMock(spec=["step"])

    def slow_step(_prompt: str):
        time.sleep(0.12)
        return _AgentStepResponse("Blocking Step|done")

    agent.step.side_effect = slow_step
    started = time.perf_counter()

    async def ticker():
        await asyncio.sleep(0.01)
        return time.perf_counter() - started

    result, tick_elapsed = await asyncio.gather(
        _run_agent_step(agent, "prompt"), ticker()
    )
    assert result.msgs[0].content == "Blocking Step|done"
    assert tick_elapsed < 0.08


@pytest.mark.asyncio
async def test_agent_step_consumes_a_streaming_response():
    """Codex subscription forces streaming responses even for helpers."""
    from camel.agents.chat_agent import StreamingChatAgentResponse

    agent = MagicMock(spec=["step"])

    def stream():
        yield _StreamChunk(msg=_StreamMsg("Streamed Task|"))
        yield _StreamChunk(msg=_StreamMsg("streamed summary"))

    agent.step.return_value = StreamingChatAgentResponse(stream())
    result = await _run_agent_step(agent, "prompt")
    assert result.msg.content == "Streamed Task|streamed summary"


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["single-agent", "workforce"])
async def test_every_session_runs_on_the_geo_agent(
    sample_chat_data, mock_task_lock, mode
):
    options = Chat(**{**sample_chat_data, "session_mode": mode})
    request = MagicMock()
    request.state.hands = None
    request.headers = {}
    seen = {}

    async def solve(*_args, **kwargs):
        seen["summarize_task"] = kwargs["summarize_task"]
        yield "chunk"

    with patch("app.service.chat_service.single_agent_solve", new=solve):
        responses = [
            response
            async for response in step_solve(options, request, mock_task_lock)
        ]

    assert responses == ["chunk"]
    assert seen["summarize_task"].func is _summarize_single_agent_task


@pytest.mark.asyncio
async def test_session_title_is_a_background_model_call(sample_chat_data):
    options = Chat(**sample_chat_data)
    agent = MagicMock(spec=["step"])
    agent.step.return_value = SimpleNamespace(
        msg=SimpleNamespace(content="SMA敏护首轮诊断|诊断第一轮的回答"),
        msgs=[],
    )
    with patch(
        "app.service.chat_service.session_title_agent", return_value=agent
    ):
        title = await _summarize_single_agent_task(
            options, "帮我诊断第一轮", "task-1"
        )
    assert title == "SMA敏护首轮诊断|诊断第一轮的回答"
    prompt = agent.step.call_args.args[0]
    assert "帮我诊断第一轮" in prompt
    # Only the user's message is titled, not the completion-report rules.
    assert DEFAULT_SUMMARY_PROMPT.strip() not in prompt


@pytest.mark.asyncio
async def test_session_title_falls_back_to_the_question(sample_chat_data):
    options = Chat(**sample_chat_data)
    agent = MagicMock(spec=["step"])
    agent.step.side_effect = RuntimeError("model unavailable")
    with patch(
        "app.service.chat_service.session_title_agent", return_value=agent
    ):
        title = await _summarize_single_agent_task(
            options, "帮我诊断第一轮", "task-1"
        )
    assert title == "帮我诊断第一轮|帮我诊断第一轮"
