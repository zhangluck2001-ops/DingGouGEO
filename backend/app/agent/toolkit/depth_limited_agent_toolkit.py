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

from collections.abc import Callable
from contextvars import Context, copy_context
from threading import Lock
from typing import Any

from camel.agents.chat_agent import StreamingChatAgentResponse
from camel.responses import ChatAgentResponse
from camel.toolkits import AgentToolkit, FunctionTool, RegisteredAgentToolkit

from app.agent.toolkit.abstract_toolkit import AbstractToolkit
from app.run_journal.model_capture import capture_agent_scope


def _is_agent_tool(tool: FunctionTool | Callable) -> bool:
    func = getattr(tool, "func", tool)
    toolkit = getattr(func, "__self__", None)
    return isinstance(toolkit, AgentToolkit)


# Tools a GEO stage sub-agent never needs: it reports back to the root agent
# instead of talking to the user, and memory is the root's job. Each tool's
# schema is resent on every model call, so these cost ~3k tokens a call.
_STAGE_CHILD_EXCLUDED_TOOLS = frozenset(
    {
        "ask_human_via_gui",
        "send_message_to_user",
        "shell_ask_user_for_help",
        "step_update",
        "notebook_edit_cell",
        "remember_project_memory",
        "update_project_memory",
        "promote_project_memory",
        "forget_project_memory",
        "search_memory",
        "search_project_history",
    }
)


def _tool_name(tool: FunctionTool | Callable) -> str:
    if isinstance(tool, FunctionTool):
        return tool.get_function_name()
    return getattr(tool, "__name__", "")


def _last_assistant_text(agent: Any) -> str:
    """The child's final answer: its last assistant message with text."""
    try:
        history = agent.chat_history
    except Exception:
        return ""
    for message in reversed(history):
        if message.get("role") != "assistant":
            continue
        content = message.get("content")
        if isinstance(content, list):
            content = "".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict)
            )
        if isinstance(content, str) and content.strip():
            return content
    return ""


class DepthLimitedAgentToolkit(AgentToolkit, AbstractToolkit):
    """CAMEL AgentToolkit with delegated-agent recursion disabled.

    CAMEL's native AgentToolkit clones the parent tool set into child agents.
    For Eigent single-agent mode we want root agents to delegate, while child
    agents must not delegate again. This adapter keeps the CAMEL toolkit API
    and removes AgentToolkit tools from child tool sets.
    """

    def __init__(
        self,
        *,
        current_depth: int = 0,
        max_depth: int = 1,
        timeout: float | None = None,
    ) -> None:
        super().__init__(timeout=timeout)
        self.current_depth = current_depth
        self.max_depth = max_depth
        self._child_contexts: dict[int, Context] = {}
        self._child_context_lock = Lock()

    def _submit_agent_task(
        self, agent_id: str, agent: Any, prompt: str
    ) -> Any:
        """Capture the admitted Run context before CAMEL changes threads."""

        agent_key = id(agent)
        with self._child_context_lock:
            self._child_contexts[agent_key] = copy_context()
        try:
            return super()._submit_agent_task(agent_id, agent, prompt)
        except Exception:
            with self._child_context_lock:
                self._child_contexts.pop(agent_key, None)
            raise

    def _run_agent_step(self, agent: Any, prompt: str) -> Any:
        # ThreadPoolExecutor.submit does not copy ContextVars. Run the cloned
        # ListenChatAgent inside the exact submission context so each child
        # tool keeps the parent Run/Attempt audit and permission boundary.
        with self._child_context_lock:
            context = self._child_contexts.pop(id(agent), None)
        if context is None:
            return self._step_to_completion(agent, prompt)
        return context.run(self._step_to_completion, agent, prompt)

    def _step_to_completion(self, agent: Any, prompt: str) -> Any:
        """Run the child's step and finish it before the task counts as done.

        Our agents stream in delta mode, so ``step`` hands back a lazy
        StreamingChatAgentResponse: the work happens only while it is read,
        and its final message is empty. CAMEL reads it from the task's done
        callback and again from ``_get_task``; a second task on the same
        child then reads two streams at once ("generator already executing")
        and the delegation fails as an unsafe outcome. Reading the stream
        here, in the worker thread, makes the future finish when the work
        does and gives CAMEL a plain response holding the child's answer.
        """
        with capture_agent_scope(getattr(agent, "agent_id", None)):
            response = super()._run_agent_step(agent, prompt)
            if not isinstance(response, StreamingChatAgentResponse):
                return response
            deltas: list[str] = []
            final: ChatAgentResponse | None = None
            for chunk in response:
                final = chunk
                for msg in chunk.msgs:
                    if msg.content:
                        deltas.append(msg.content)
        if final is None:
            return ChatAgentResponse(msgs=[], terminated=False, info={})
        text = _last_assistant_text(agent) or "".join(deltas)
        msgs = [
            msg.create_new_instance(text) if i == 0 else msg
            for i, msg in enumerate(final.msgs)
        ]
        return ChatAgentResponse(
            msgs=msgs, terminated=final.terminated, info=final.info
        )

    def _create_subagent(self, subagent_type: str, description: str) -> Any:
        """A child that is one of our agents, not a bare CAMEL ChatAgent.

        CAMEL builds a plain ChatAgent, which skips our tool checkpoints: a
        child's file reads and shell commands never reached the run's tool
        log, so nobody could see what a delegated step did. Built as a
        ListenChatAgent named after its sub-agent type, its tool calls are
        journaled like the root's and its turns show under its own name.
        """
        from app.agent.listen_chat_agent import ListenChatAgent

        parent = self._require_parent_agent()
        if not isinstance(parent, ListenChatAgent):
            return super()._create_subagent(subagent_type, description)
        tools, toolkits_to_register = self._resolve_child_tools(parent=parent)
        from app.geo.harness import stage_for_subagent

        if tools is not None and stage_for_subagent(subagent_type):
            tools = [
                tool
                for tool in tools
                if _tool_name(tool) not in _STAGE_CHILD_EXCLUDED_TOOLS
            ]
        extra: dict[str, Any] = {}
        if parent._user_on_request_usage is not None:
            extra["on_request_usage"] = parent._user_on_request_usage
        child = ListenChatAgent(
            api_task_id=parent.api_task_id,
            agent_name=subagent_type or parent.agent_name,
            system_message=self._build_system_message(
                subagent_type=subagent_type, description=description
            ),
            model=parent.model_backend.models,
            message_window_size=getattr(parent.memory, "window_size", None),
            token_limit=getattr(
                parent.memory.get_context_creator(), "token_limit", None
            ),
            output_language=getattr(parent, "_output_language", None),
            tools=tools,
            toolkits_to_register_agent=toolkits_to_register,
            response_terminators=parent.response_terminators,
            scheduling_strategy=(
                parent.model_backend.scheduling_strategy.__name__
            ),
            max_iteration=parent.max_iteration,
            tool_execution_timeout=parent.tool_execution_timeout,
            prune_tool_calls_from_memory=parent.prune_tool_calls_from_memory,
            step_timeout=parent.step_timeout,
            stall_timeout=parent.stall_timeout,
            stream_accumulate=parent.stream_accumulate,
            summarize_threshold=getattr(parent, "summarize_threshold", None),
            announce=parent.announce,
            **extra,
        )
        child.process_task_id = parent.process_task_id
        return child

    def _resolve_child_tools(
        self,
        parent,
    ) -> tuple[
        list[FunctionTool | Callable] | None,
        list[RegisteredAgentToolkit] | None,
    ]:
        tools, toolkits_to_register = super()._resolve_child_tools(parent)
        if tools is None:
            return None, toolkits_to_register

        return (
            [tool for tool in tools if not _is_agent_tool(tool)],
            [
                toolkit
                for toolkit in (toolkits_to_register or [])
                if not isinstance(toolkit, AgentToolkit)
            ],
        )

    def _build_system_message(
        self,
        subagent_type: str,
        description: str,
    ) -> str:
        # A GEO stage type gets that stage's own prompt. Imported here:
        # app.geo.agent_prompt imports the agent package this module is in.
        from app.geo.agent_prompt import build_subagent_prompt

        stage_prompt = build_subagent_prompt(subagent_type, description)
        if stage_prompt is not None:
            return stage_prompt
        base = super()._build_system_message(subagent_type, description)
        return (
            base + "\nYou are a child sub-agent. Complete the assigned task "
            "directly and do not create or delegate to any further sub-agents."
        )

    @classmethod
    def toolkit_name(cls) -> str:
        return "AgentToolkit"
