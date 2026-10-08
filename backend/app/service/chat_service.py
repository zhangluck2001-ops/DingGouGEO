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
"""Runs a chat session. DingGouGEO has one kind: the GEO Agent.

The upstream Workforce (a coordinator, a task planner and generic workers)
was removed on 2026-10-08; ``chat_controller.start_chat_stream`` already
turned every session into a GEO Agent session.
"""

import asyncio
import logging
from functools import partial
from types import SimpleNamespace

from camel.utils.stream_utils import (
    consume_response_content,
    consume_response_content_async,
    is_streaming_response,
)
from fastapi import Request

from app.agent.factory.single_agent import session_title_agent
from app.agent.listen_chat_agent import ListenChatAgent
from app.geo import agent_prompt as geo_agent_prompt
from app.model.chat import Chat
from app.service.single_agent_service import single_agent_solve
from app.service.task import TaskLock
from app.utils.server.sync_step import sync_step

logger = logging.getLogger("chat_service")

SUMMARY_TASK_NAME_MAX_LENGTH = 80
SUMMARY_TASK_SUMMARY_MAX_LENGTH = 240


def _truncate_summary_part(value: str, max_length: int) -> str:
    text = " ".join((value or "").replace("|", " ").split())
    if len(text) <= max_length:
        return text
    return text[: max_length - 3].rstrip() + "..."


def normalize_summary_task(
    summary_task_content: str,
    fallback_content: str = "",
) -> str:
    raw = " ".join((summary_task_content or "").split())
    if "|" in raw:
        raw_name, raw_summary = raw.split("|", 1)
    else:
        raw_name = "Task"
        raw_summary = raw

    name = _truncate_summary_part(
        raw_name or "Task",
        SUMMARY_TASK_NAME_MAX_LENGTH,
    )
    summary = _truncate_summary_part(
        raw_summary or fallback_content or name,
        SUMMARY_TASK_SUMMARY_MAX_LENGTH,
    )
    return f"{name or 'Task'}|{summary or name or 'Task'}"


async def _summarize_single_agent_task(
    options: Chat,
    question: str,
    task_id: str,
) -> str:
    """Name the session and summarise the request as ``name|summary``.

    A background model call: it is not one of the run's agents.
    """

    async def title() -> str:
        response = await _run_agent_step(
            session_title_agent(options),
            geo_agent_prompt.session_title_prompt(
                question,
                name_max=SUMMARY_TASK_NAME_MAX_LENGTH,
                summary_max=SUMMARY_TASK_SUMMARY_MAX_LENGTH,
            ),
        )
        return normalize_summary_task(
            _extract_agent_response_content(response) or "", question
        )

    try:
        return await asyncio.wait_for(title(), timeout=10)
    except TimeoutError:
        logger.warning(
            "Single Agent summary_task timeout",
            extra={
                "project_id": options.project_id,
                "task_id": task_id,
            },
        )
    except Exception:
        logger.exception(
            "Single Agent task summary failed",
            extra={
                "project_id": options.project_id,
                "task_id": task_id,
            },
        )
    fallback_name = _truncate_summary_part(
        question,
        SUMMARY_TASK_NAME_MAX_LENGTH,
    )
    return normalize_summary_task(
        f"{fallback_name or 'Task'}|{question}",
        question,
    )


def _extract_agent_response_content(resp) -> str | None:
    if resp is None:
        return None

    msg = getattr(resp, "msg", None)
    if msg is not None:
        content = getattr(msg, "content", None)
        if content:
            return content

    msgs = getattr(resp, "msgs", None)
    if msgs:
        first = msgs[0]
        content = getattr(first, "content", None)
        if content:
            return content

    return None


def _response_with_content(resp, content: str):
    if not content:
        return resp

    msg = getattr(resp, "msg", None)
    if msg is not None:
        try:
            msg.content = content
            return resp
        except Exception:
            pass

    msgs = getattr(resp, "msgs", None)
    if msgs:
        try:
            msgs[0].content = content
            return resp
        except Exception:
            pass

    msg = SimpleNamespace(content=content)
    return SimpleNamespace(
        msg=msg,
        msgs=[msg],
        info=getattr(resp, "info", {}),
    )


async def _materialize_agent_step_result(result):
    if asyncio.iscoroutine(result):
        result = await result

    if not is_streaming_response(result):
        return result

    from camel.agents.chat_agent import AsyncStreamingChatAgentResponse

    if isinstance(result, AsyncStreamingChatAgentResponse):
        response, content = await consume_response_content_async(result)
    else:
        response, content = await asyncio.to_thread(
            consume_response_content,
            result,
        )

    return _response_with_content(response, content)


async def _run_agent_step(agent: ListenChatAgent, prompt: str):
    """Run one model step with backward-compatible priority.

    Some call sites and tests still stub synchronous ``step`` while newer paths
    provide ``astep``. Prefer ``step`` when available to preserve existing
    behavior, but run it off the event loop because real model calls are
    blocking. Fall back to ``astep``.
    """
    step_fn = getattr(agent, "step", None)
    if callable(step_fn):
        result = await asyncio.to_thread(step_fn, prompt)
        return await _materialize_agent_step_result(result)

    astep_fn = getattr(agent, "astep", None)
    if callable(astep_fn):
        return await _materialize_agent_step_result(astep_fn(prompt))

    raise AttributeError("Agent has neither step nor astep")


@sync_step
async def step_solve(options: Chat, request: Request, task_lock: TaskLock):
    """Run the session's GEO Agent and stream its events back to the client.

    Called when POST /chat starts a session; follow-up questions arrive on
    the Project's task queue.
    """
    # In-process history the GEO Agent's context is rebuilt from.
    if not hasattr(task_lock, "conversation_history"):
        task_lock.conversation_history = []
    if not hasattr(task_lock, "agent_memory_history"):
        task_lock.agent_memory_history = []
    if not hasattr(task_lock, "memory_summary"):
        task_lock.memory_summary = ""
    if not hasattr(task_lock, "summary_generated"):
        task_lock.summary_generated = False

    # Hands from ChannelSessionMiddleware (desktop = full access).
    hands = getattr(request.state, "hands", None)
    logger.info(
        "step_solve started",
        extra={"project_id": options.project_id, "task_id": options.task_id},
    )
    async for chunk in single_agent_solve(
        options,
        request,
        task_lock,
        hands=hands,
        summarize_task=partial(_summarize_single_agent_task, options),
    ):
        yield chunk
