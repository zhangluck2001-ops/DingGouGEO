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
"""Local GEO boards backed by SQLite: records, dashboard, and Feishu sync."""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.geo import (
    feishu_import,
    harness,
    knowledge,
    metrics,
    pipeline_status,
    queries,
    rounds,
    space_bootstrap,
    stage_tasks,
)
from app.utils.workspace_resolver import get_workspace_resolver

router = APIRouter(prefix="/geo", tags=["GEO"])

_RESERVED_PARAMS = {"project_id", "q", "sort", "order", "page", "page_size"}


class CreateRecordBody(BaseModel):
    project_id: int
    fields: dict[str, str | None] = Field(default_factory=dict)


class UpdateRecordBody(BaseModel):
    project_id: int | None = None
    fields: dict[str, str | None] = Field(default_factory=dict)


class EnsureSpaceBody(BaseModel):
    space_id: str = Field(min_length=1)
    name: str = ""
    email: str | None = None
    user_id: str | None = None


class ImportSourcesBody(BaseModel):
    project_id: int
    paths: list[str] = Field(default_factory=list, max_length=200)


class SourceStatusBody(BaseModel):
    project_id: int
    file_name: str = Field(min_length=1)
    status: str


class DeleteRecordsBody(BaseModel):
    project_id: int | None = None
    ids: list[int] = Field(default_factory=list, max_length=1000)


class ImportBody(BaseModel):
    project_id: int


def _dataset(name: str) -> str:
    if name not in queries.DATASETS:
        raise HTTPException(status_code=404, detail="Unknown GEO dataset")
    return name


@router.get("/projects")
def list_projects():
    return {"items": queries.list_projects()}


@router.get("/agents")
def list_agents():
    return harness.agents_overview()


@router.get("/metrics")
def round_metrics(project_id: int, capture_round: str):
    """The contract's metrics for one capture round, per platform."""
    return metrics.round_metrics(project_id, capture_round)


@router.get("/pipeline")
def pipeline(project_id: int):
    """Each stage's completion checks for the Space, for the overview."""
    try:
        return pipeline_status.pipeline_status(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/stages/{key}/task")
def stage_task(key: str, project_id: int, capture_round: str | None = None):
    """What a stage page's "hand to AI" button puts in the chat."""
    try:
        text = stage_tasks.stage_task(key, project_id, capture_round or None)
    except stage_tasks.UnknownStage as exc:
        raise HTTPException(
            status_code=404, detail=f"Unknown stage: {key}"
        ) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"text": text}


@router.get("/metrics/compare")
def compare_metrics(project_id: int, base_round: str, later_round: str):
    """Two rounds over the probes both measured."""
    return metrics.compare_rounds(project_id, base_round, later_round)


@router.post("/spaces/ensure")
def ensure_space(body: EnsureSpaceBody):
    """Make the Space a GEO brand project and scaffold its GEO folders."""
    workspace_root = None
    if body.email:
        binding = get_workspace_resolver().store.get_binding(
            body.email, body.space_id, body.user_id
        )
        if binding is not None:
            workspace_root = binding.workspace_root
    return space_bootstrap.ensure_space_project(
        body.space_id, body.name, workspace_root
    )


@router.get("/knowledge")
def knowledge_status(project_id: int):
    try:
        return knowledge.status(project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/knowledge/rules")
def knowledge_rules():
    return {"markdown": knowledge.cleaning_rules()}


@router.post("/knowledge/sources")
def import_knowledge_sources(body: ImportSourcesBody):
    try:
        return {
            "imported": knowledge.import_sources(body.project_id, body.paths)
        }
    except LookupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/knowledge/sources/status")
def set_knowledge_source_status(body: SourceStatusBody):
    try:
        knowledge.set_source_status(
            body.project_id, body.file_name, body.status
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/dashboard")
def dashboard(project_id: int, capture_round: str | None = None):
    return queries.dashboard(project_id, capture_round or None)


@router.get("/rounds/compare")
def compare_rounds(project_id: int):
    return {"items": queries.round_comparison(project_id)}


@router.get("/import")
def import_status(project_id: int):
    return {
        "running": feishu_import.is_import_running(project_id),
        "configured": feishu_import.load_sources(project_id) is not None,
        "runs": queries.import_runs(project_id),
    }


@router.post("/import")
def start_import(body: ImportBody):
    try:
        started = feishu_import.start_import_in_background(body.project_id)
    except LookupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "started": started,
        "running": feishu_import.is_import_running(body.project_id),
    }


@router.get("/datasets/{dataset}")
def list_records(
    dataset: str,
    request: Request,
    project_id: int | None = None,
    q: str | None = None,
    sort: str | None = None,
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    filters = {
        key: value
        for key, value in request.query_params.items()
        if key not in _RESERVED_PARAMS
    }
    return queries.list_records(
        _dataset(dataset), project_id, filters, q, sort, order, page, page_size
    )


@router.get("/datasets/{dataset}/{record_id}")
def get_record(dataset: str, record_id: int, project_id: int | None = None):
    record = queries.get_record(_dataset(dataset), record_id, project_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.post("/datasets/{dataset}")
def create_record(dataset: str, body: CreateRecordBody):
    try:
        return queries.create_record(
            _dataset(dataset), body.project_id, body.fields
        )
    except rounds.RoundInUse as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/datasets/{dataset}/{record_id}")
def update_record(dataset: str, record_id: int, body: UpdateRecordBody):
    try:
        record = queries.update_record(
            _dataset(dataset), record_id, body.fields, body.project_id
        )
    except rounds.RoundInUse as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return record


@router.post("/datasets/{dataset}/delete")
def delete_records(dataset: str, body: DeleteRecordsBody):
    try:
        deleted = queries.delete_records(
            _dataset(dataset), body.ids, body.project_id
        )
    except rounds.RoundInUse as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"deleted": deleted}
