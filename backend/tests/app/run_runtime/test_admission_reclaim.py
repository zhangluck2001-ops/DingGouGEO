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

import logging
from unittest.mock import patch

import pytest

from app.run_journal import SQLiteRunJournal
from app.run_runtime import admission
from app.workspace_git import WorkspaceWriterScheduler

LOGGER = logging.getLogger("test")


@pytest.fixture
def journal(tmp_path):
    with SQLiteRunJournal(tmp_path / "run-journal.sqlite3") as value:
        yield value


def _binding(journal, project_id):
    if journal.get_git_repository("repo-1") is None:
        journal.put_git_repository(
            repository_id="repo-1",
            space_id="space-1",
            repository_role="content",
            root_path="/tmp/space-1",
            root_path_digest="a" * 64,
            ownership="eigent_owned",
            state="ready",
            version_coverage="full",
            now=1,
        )
    return journal.ensure_project_workspace_binding(
        project_id=project_id,
        repository_id="repo-1",
        checkout_id="checkout-primary",
        checkout_mode="primary_checkout",
        target_ref="refs/heads/main",
        worktree_path="/tmp/space-1",
    )


def _holder_and_waiter(journal, holder_status):
    scheduler = WorkspaceWriterScheduler(journal)
    for run_id, project_id in (("old", "project-old"), ("new", "project-new")):
        journal.ensure_run(run_id=run_id, project_id=project_id)
    scheduler.admit_task(
        run_id="old",
        task_id="old",
        project_id="project-old",
        binding=_binding(journal, "project-old"),
    )
    queued = scheduler.admit_task(
        run_id="new",
        task_id="new",
        project_id="project-new",
        binding=_binding(journal, "project-new"),
    )
    assert queued.request.status == "queued"
    with journal._lock:
        journal._connection.execute(
            "UPDATE runs SET status = ? WHERE run_id = 'old'", (holder_status,)
        )
        journal._connection.commit()
    return scheduler


class _Coordinator:
    """Stands in for the run coordinator: cancelling releases the writer."""

    def __init__(self, journal):
        self.journal = journal
        self.cancelled: list[str] = []

    async def cancel_durable(self, run_id, *, request_id, reason):
        self.cancelled.append(run_id)
        WorkspaceWriterScheduler(self.journal).finish_task(run_id=run_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("holder_status", ["interrupted", "waiting_for_user"])
async def test_an_abandoned_holder_is_ended_for_the_new_task(
    journal, holder_status
):
    _holder_and_waiter(journal, holder_status)
    coordinator = _Coordinator(journal)
    with (
        patch(
            "app.run_runtime.get_default_run_coordinator",
            return_value=coordinator,
        ),
        patch("app.service.task.get_task_lock_if_exists", return_value=None),
    ):
        await admission._reclaim_abandoned_writer(
            journal, run_id="new", logger=LOGGER
        )

    assert coordinator.cancelled == ["old"]
    request = journal.get_workspace_writer_request("workspace-writer:new")
    assert request.status == "acquired"
    events = [event.event_type for event in journal.list_events("new")]
    assert "workspace.writer.reclaimed" in events


@pytest.mark.asyncio
async def test_a_holder_still_running_in_this_process_keeps_the_space(journal):
    _holder_and_waiter(journal, "running")
    coordinator = _Coordinator(journal)
    with (
        patch(
            "app.run_runtime.get_default_run_coordinator",
            return_value=coordinator,
        ),
        patch(
            "app.service.task.get_task_lock_if_exists", return_value=object()
        ),
    ):
        await admission._reclaim_abandoned_writer(
            journal, run_id="new", logger=LOGGER
        )

    assert coordinator.cancelled == []
    request = journal.get_workspace_writer_request("workspace-writer:new")
    assert request.status == "queued"
