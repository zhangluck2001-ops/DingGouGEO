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

"""Shared in-process activation gate for durable improve commands."""

from __future__ import annotations

import asyncio
import logging

from app.run_journal import SQLiteRunJournal, get_default_run_journal
from app.service.task import ActionImproveData, TaskLock
from app.workspace_git.coordinator import get_default_workspace_git_coordinator
from app.workspace_git.scheduler import (
    WorkspaceWriterScheduler,
    record_superseded_holder,
)

# A run in one of these states may still finish on its own and release the
# Space; any other holder (interrupted, or ended without releasing) never
# will.
_LIVE_RUN_STATUSES = frozenset({"pending", "running", "waiting_for_user"})


async def _reclaim_abandoned_writer(
    journal: SQLiteRunJournal,
    *,
    run_id: str,
    logger: logging.Logger,
) -> None:
    """End a task that holds this run's Space but will never release it.

    An interrupted run keeps its Space's writer so it can be resumed, and a
    run whose process died with the app (e.g. left waiting for an answer)
    keeps it forever. A new message then sat behind it at "preparing to
    start" with no way out. Like starting a new prompt in Claude Code, the
    new task wins: the abandoned run is cancelled through the normal path
    (which settles its files) and the new task's timeline says so. A holder
    that is still alive in this process keeps the Space.
    """

    request = await asyncio.to_thread(
        journal.get_workspace_writer_request,
        WorkspaceWriterScheduler.request_id(run_id),
    )
    if request is None or request.status != "queued":
        return
    lease = await asyncio.to_thread(
        journal.get_workspace_writer_lease,
        repository_id=request.repository_id,
        checkout_id=request.checkout_id,
    )
    holder_run_id = (
        WorkspaceWriterScheduler.run_id_from_request_id(lease.request_id)
        if lease is not None
        else None
    )
    if not holder_run_id or holder_run_id == run_id:
        return
    holder = await asyncio.to_thread(journal.get_run, holder_run_id)
    if holder is None:
        return
    from app.service.task import get_task_lock_if_exists

    if (
        holder.status in _LIVE_RUN_STATUSES
        and get_task_lock_if_exists(holder.project_id) is not None
    ):
        return
    logger.info(
        "Ending an abandoned task that still holds the Space",
        extra={
            "run_id": run_id,
            "superseded_run_id": holder_run_id,
            "superseded_status": holder.status,
        },
    )
    try:
        if holder.status in _LIVE_RUN_STATUSES | {"interrupted"}:
            from app.run_runtime import get_default_run_coordinator

            await get_default_run_coordinator().cancel_durable(
                holder_run_id,
                request_id=f"superseded-by:{run_id}",
                reason="superseded_by_new_task",
            )
        else:
            await asyncio.to_thread(
                WorkspaceWriterScheduler(journal).finish_task,
                run_id=holder_run_id,
            )
        await asyncio.to_thread(
            record_superseded_holder,
            journal,
            run_id=run_id,
            project_id=request.project_id,
            superseded_run_id=holder_run_id,
        )
    except Exception:
        # Waiting stays the fallback: the user can still stop either task.
        logger.exception(
            "Could not end the abandoned task holding the Space",
            extra={"run_id": run_id, "superseded_run_id": holder_run_id},
        )


async def activate_improve_admission(
    task_lock: TaskLock,
    item: ActionImproveData,
    *,
    project_id: str,
    logger: logging.Logger,
) -> bool:
    """Activate a pending Attempt once and discard duplicate queue envelopes."""

    if not item.request_id:
        return True
    if item.request_id in task_lock.processed_improve_request_ids:
        logger.info(
            "Skipping duplicate improve admission",
            extra={"project_id": project_id, "request_id": item.request_id},
        )
        return False
    if item.attempt_id and item.run_id:
        journal = get_default_run_journal()
        if isinstance(journal, SQLiteRunJournal):
            await _reclaim_abandoned_writer(
                journal, run_id=item.run_id, logger=logger
            )
            await WorkspaceWriterScheduler(journal).wait_until_acquired(
                run_id=item.run_id,
                task_id=item.new_task_id or item.run_id,
            )
            coordinator = get_default_workspace_git_coordinator()
            await asyncio.to_thread(
                coordinator.refresh_run_boundary_after_writer_acquired,
                run_id=item.run_id,
                task_id=item.new_task_id or item.run_id,
                attempt_id=item.attempt_id,
            )
        await asyncio.to_thread(
            journal.activate_run_attempt,
            item.attempt_id,
            expected_run_id=item.run_id,
        )
    task_lock.processed_improve_request_ids.add(item.request_id)
    return True
