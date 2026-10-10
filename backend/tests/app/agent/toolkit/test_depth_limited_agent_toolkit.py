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

from contextvars import ContextVar
from types import SimpleNamespace

from camel.agents.chat_agent import StreamingChatAgentResponse
from camel.messages import BaseMessage
from camel.responses import ChatAgentResponse
from camel.toolkits import FunctionTool

from app.agent.toolkit.depth_limited_agent_toolkit import (
    DepthLimitedAgentToolkit,
)


def _normal_tool() -> str:
    return "ok"


class DummyParent:
    def __init__(self):
        self.agent_toolkit = DepthLimitedAgentToolkit()

    def _clone_tools(self):
        return (
            [
                FunctionTool(self.agent_toolkit.agent_run_subagent),
                FunctionTool(_normal_tool),
            ],
            [self.agent_toolkit],
        )


def test_depth_limited_agent_toolkit_filters_child_delegation_tools():
    toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)

    tools, toolkits_to_register = toolkit._resolve_child_tools(DummyParent())

    tool_names = [tool.get_function_name() for tool in tools]
    assert "agent_run_subagent" not in tool_names
    assert "_normal_tool" in tool_names
    assert toolkits_to_register == []


def test_depth_limited_agent_toolkit_propagates_run_context_to_child_thread():
    marker: ContextVar[str] = ContextVar("child-run-marker", default="missing")
    observed: list[str] = []

    class DummyAgent:
        agent_id = "child-1"
        stop_event = None

        def step(self, _prompt):
            observed.append(marker.get())
            return SimpleNamespace(msgs=[])

    toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)
    agent = DummyAgent()
    toolkit._sessions[agent.agent_id] = SimpleNamespace(
        agent=agent,
        subagent_type="research",
        description="Research references",
        turns=0,
        active_task_id=None,
    )
    token = marker.set("run-1")
    try:
        task = toolkit._submit_agent_task(
            agent_id=agent.agent_id,
            agent=agent,
            prompt="inspect",
        )
        task.future.result(timeout=2)
    finally:
        marker.reset(token)
        toolkit._executor.shutdown(wait=True)

    assert observed == ["run-1"]


class StreamingChild:
    """Streams in delta mode like our agents: the work runs while the
    response is read, and the final chunk's message is empty."""

    agent_id = "child-stream"
    stop_event = None

    def __init__(self):
        self.history: list[dict] = []
        self.steps = 0

    @property
    def chat_history(self):
        return list(self.history)

    def step(self, prompt):
        self.steps += 1
        answer = f"已清洗 3 份资料（第 {self.steps} 次）"

        def chunks():
            for piece in ("已清洗", " 3 份资料"):
                yield ChatAgentResponse(
                    msgs=[_msg(piece)],
                    terminated=False,
                    info={"partial": True},
                )
            self.history.append({"role": "assistant", "content": answer})
            yield ChatAgentResponse(
                msgs=[_msg("")], terminated=False, info={"partial": False}
            )

        return StreamingChatAgentResponse(chunks())


def _msg(content: str) -> BaseMessage:
    return BaseMessage.make_assistant_message(
        role_name="child", content=content
    )


def _toolkit_with(agent) -> DepthLimitedAgentToolkit:
    toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)
    toolkit._agent = SimpleNamespace(agent_id="parent")  # registered parent
    toolkit._sessions[agent.agent_id] = SimpleNamespace(
        agent=agent,
        subagent_type="geo-knowledge",
        description="清洗",
        turns=0,
        active_task_id=None,
    )
    return toolkit


def test_streaming_child_returns_its_final_answer():
    agent = StreamingChild()
    toolkit = _toolkit_with(agent)
    try:
        result = toolkit.agent_run_subagent(
            prompt="清洗", agent_id=agent.agent_id, wait=True, timeout=5
        )
    finally:
        toolkit._executor.shutdown(wait=True)

    assert result["status"] == "completed"
    assert result["result"] == "已清洗 3 份资料（第 1 次）"


def test_streaming_child_takes_a_second_task_on_the_same_agent():
    agent = StreamingChild()
    toolkit = _toolkit_with(agent)
    try:
        first = toolkit.agent_run_subagent(
            prompt="清洗", agent_id=agent.agent_id, wait=True, timeout=5
        )
        second = toolkit.agent_run_subagent(
            prompt="补充说明", agent_id=agent.agent_id, wait=True, timeout=5
        )
    finally:
        toolkit._executor.shutdown(wait=True)

    assert first["result"].endswith("第 1 次）")
    assert second["status"] == "completed"
    assert second["error"] is None
    assert second["result"] == "已清洗 3 份资料（第 2 次）"


def test_streaming_child_without_history_falls_back_to_the_deltas():
    class NoHistory(StreamingChild):
        @property
        def chat_history(self):
            raise RuntimeError("memory unavailable")

    agent = NoHistory()
    toolkit = _toolkit_with(agent)
    try:
        result = toolkit.agent_run_subagent(
            prompt="清洗", agent_id=agent.agent_id, wait=True, timeout=5
        )
    finally:
        toolkit._executor.shutdown(wait=True)

    assert result["result"] == "已清洗 3 份资料"


def test_geo_stage_type_gets_the_stage_prompt_and_others_the_generic_one():
    toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)
    try:
        stage = toolkit._build_system_message("geo-content", "写三篇底稿")
        generic = toolkit._build_system_message("research", "Find references")
    finally:
        toolkit._executor.shutdown(wait=True)

    assert stage.startswith("你是 DingGouGEO 的「内容生产」子智能体")
    assert "本次任务：写三篇底稿" in stage
    assert "Sub-agent type: research" in generic
    assert "do not create or delegate" in generic


def test_a_listen_agent_parent_gets_a_listen_agent_child():
    from unittest.mock import MagicMock, patch

    from app.agent.listen_chat_agent import ListenChatAgent

    with (
        patch("app.agent.listen_chat_agent.get_task_lock"),
        patch("camel.models.ModelFactory.create") as create_model,
    ):
        from camel.models import BaseModelBackend

        backend = MagicMock(spec=BaseModelBackend)
        backend.model_type = "gpt-4"
        backend.token_limit = 100_000
        create_model.return_value = backend
        toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)
        parent = ListenChatAgent(
            api_task_id="task-1",
            agent_name="single_agent",
            model="gpt-4",
            system_message="root",
            tools=[FunctionTool(_normal_tool)],
            toolkits_to_register_agent=[toolkit],
        )
        parent.process_task_id = "task-1"

        child = toolkit._create_subagent("geo-knowledge", "清洗")

    assert isinstance(child, ListenChatAgent)
    assert child.agent_name == "geo-knowledge"
    assert child.agent_id != parent.agent_id
    assert child.process_task_id == "task-1"
    names = [
        tool.get_function_name() for tool in child._internal_tools.values()
    ]
    assert "_normal_tool" in names
    assert "agent_run_subagent" not in names


def test_a_geo_stage_child_does_not_carry_user_facing_tools():
    from unittest.mock import MagicMock, patch

    from camel.models import BaseModelBackend

    from app.agent.listen_chat_agent import ListenChatAgent

    def ask_human_via_gui() -> str:
        """Ask the user."""
        return "ok"

    with (
        patch("app.agent.listen_chat_agent.get_task_lock"),
        patch("camel.models.ModelFactory.create") as create_model,
    ):
        backend = MagicMock(spec=BaseModelBackend)
        backend.model_type = "gpt-4"
        backend.token_limit = 100_000
        create_model.return_value = backend
        toolkit = DepthLimitedAgentToolkit(current_depth=0, max_depth=1)
        parent = ListenChatAgent(
            api_task_id="task-1",
            agent_name="single_agent",
            model="gpt-4",
            system_message="root",
            tools=[
                FunctionTool(_normal_tool),
                FunctionTool(ask_human_via_gui),
            ],
            toolkits_to_register_agent=[toolkit],
        )
        stage_child = toolkit._create_subagent("geo-knowledge", "清洗")
        other_child = toolkit._create_subagent("general-purpose", "杂事")

    stage_tools = set(stage_child._internal_tools)
    assert "_normal_tool" in stage_tools
    assert "ask_human_via_gui" not in stage_tools
    assert "ask_human_via_gui" in set(other_child._internal_tools)
