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
"""Read and write access for the GEO boards.

Every board is a *dataset*: one SQLite table plus the columns people may
filter, sort, search, and edit. The frontend grid, kanban, and record views
and the agent all go through these functions.
"""

import uuid
from dataclasses import dataclass, field

from app.geo import store

MAX_PAGE_SIZE = 200


@dataclass(frozen=True)
class Dataset:
    table: str
    columns: tuple[str, ...]
    search: tuple[str, ...]
    facets: tuple[str, ...]
    default_sort: str
    computed: dict[str, str] = field(default_factory=dict)


# A published URL counts as cited when it appears verbatim as a captured
# citation source. Matching rules will be refined with the metrics work.
_CONTENT_CITED = (
    "(SELECT COUNT(*) FROM geo_citation c WHERE c.project_id = t.project_id"
    " AND c.deleted = 0 AND t.url IS NOT NULL AND t.url != ''"
    " AND c.url = t.url)"
)
_ANSWER_CITATIONS = (
    "(SELECT COUNT(*) FROM geo_citation c WHERE c.run_id = t.capture_code"
    " AND c.batch = t.batch AND c.project_id = t.project_id AND c.deleted = 0)"
)

DATASETS: dict[str, Dataset] = {
    "answers": Dataset(
        table="geo_answer",
        columns=(
            "capture_code",
            "probe_code",
            "probe_text",
            "platform",
            "round",
            "batch",
            "capture_date",
            "account",
            "answer",
            "web_search",
            "share_url",
            "keywords",
            "category_word",
            "brand_pointer",
        ),
        search=("probe_text", "probe_code", "capture_code", "answer"),
        facets=("platform", "batch", "round", "web_search"),
        default_sort="capture_code",
        computed={"citation_count": _ANSWER_CITATIONS},
    ),
    "citations": Dataset(
        table="geo_citation",
        columns=(
            "run_id",
            "probe_code",
            "ai_platform",
            "batch",
            "source_platform",
            "source_type",
            "title",
            "url",
            "capture_date",
        ),
        search=("title", "url", "source_platform", "run_id", "probe_code"),
        facets=("ai_platform", "source_type", "batch"),
        default_sort="id",
    ),
    "probes": Dataset(
        table="geo_probe",
        columns=(
            "code",
            "text",
            "category_word",
            "direction",
            "brand_pointer",
            "review_status",
            "cep",
            "framework",
            "note",
        ),
        search=("text", "code", "note"),
        facets=("review_status", "direction", "cep", "category_word"),
        default_sort="code",
    ),
    "facts": Dataset(
        table="geo_fact",
        columns=(
            "module",
            "product",
            "field",
            "content",
            "claim_type",
            "evidence_grade",
            "source",
            "note",
        ),
        search=("content", "field", "product", "source", "note"),
        facets=("module", "claim_type", "evidence_grade", "product"),
        default_sort="id",
    ),
    "contents": Dataset(
        table="geo_content",
        columns=(
            "serial",
            "title",
            "url",
            "account_platform",
            "account_name",
            "status",
        ),
        search=("title", "account_name", "url"),
        facets=("account_platform", "status", "account_name"),
        default_sort="serial_num",
        computed={
            "cited_count": _CONTENT_CITED,
            "serial_num": "CAST(t.serial AS INTEGER)",
        },
    ),
}

# Options offered even before any row uses them.
CONTENT_STATUSES = ("草稿", "待发布", "已发布")
FIXED_OPTIONS: dict[str, dict[str, tuple[str, ...]]] = {
    "geo_content": {"status": CONTENT_STATUSES},
    "geo_fact": {
        "module": (
            "00_总览",
            "01_品牌实体",
            "02_产品库",
            "03_资质合规",
            "04_FAQ",
            "05_竞品对比",
            "06_合规红线",
        ),
        "claim_type": ("事实", "宣称", "话术", "存疑", "待核实"),
        "evidence_grade": ("A", "B", "C", "D", "E"),
    },
}


class UnknownDataset(KeyError):
    pass


def get_dataset(name: str) -> Dataset:
    try:
        return DATASETS[name]
    except KeyError as exc:
        raise UnknownDataset(name) from exc


def _page(page: int, page_size: int) -> tuple[int, int]:
    size = max(1, min(page_size, MAX_PAGE_SIZE))
    return size, max(0, page - 1) * size


def _select_list(ds: Dataset, include_long: bool = True) -> str:
    cols = ["t.id", "t.local_edited", "t.updated_at"]
    for col in ds.columns:
        if col == "answer" and not include_long:
            cols.append("substr(t.answer, 1, 160) AS answer")
        else:
            cols.append(f"t.{col}")
    cols += [f"{expr} AS {alias}" for alias, expr in ds.computed.items()]
    return ", ".join(cols)


def _where(
    ds: Dataset,
    project_id: int | None,
    filters: dict[str, str] | None,
    q: str | None,
) -> tuple[str, list]:
    clauses = ["t.deleted = 0"]
    params: list = []
    if project_id is not None:
        clauses.append("t.project_id = ?")
        params.append(project_id)
    for column, value in (filters or {}).items():
        if column in ds.facets and value not in (None, ""):
            clauses.append(f"t.{column} = ?")
            params.append(value)
    if q:
        clauses.append(
            "(" + " OR ".join(f"t.{col} LIKE ?" for col in ds.search) + ")"
        )
        params.extend([f"%{q}%"] * len(ds.search))
    return " AND ".join(clauses), params


def facets(conn, ds: Dataset, project_id: int | None) -> dict[str, list]:
    where, params = _where(ds, project_id, None, None)
    result = {}
    for column in ds.facets:
        rows = conn.execute(
            f"SELECT t.{column} AS value, COUNT(*) AS count"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" FROM {ds.table} t WHERE {where}"
            f" AND t.{column} IS NOT NULL AND t.{column} != ''"
            f" GROUP BY t.{column} ORDER BY COUNT(*) DESC, t.{column}"
            f" LIMIT 200",
            params,
        ).fetchall()
        result[column] = [dict(row) for row in rows]
    for column, options in FIXED_OPTIONS.get(ds.table, {}).items():
        present = {item["value"] for item in result[column]}
        result[column] += [
            {"value": option, "count": 0}
            for option in options
            if option not in present
        ]
    return result


def list_records(
    dataset: str,
    project_id: int | None,
    filters: dict[str, str] | None = None,
    q: str | None = None,
    sort: str | None = None,
    order: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> dict:
    ds = get_dataset(dataset)
    where, params = _where(ds, project_id, filters, q)
    sortable = {"id", *ds.columns, *ds.computed}
    sort_col = sort if sort in sortable else ds.default_sort
    sort_expr = sort_col if sort_col in ds.computed else f"t.{sort_col}"
    direction = "ASC" if order == "asc" else "DESC"
    size, offset = _page(page, page_size)
    with store.connect() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM {ds.table} t WHERE {where}",  # nosec B608 -- identifiers come from fixed registries; values are bound
            params,
        ).fetchone()[0]
        items = [
            dict(row)
            for row in conn.execute(
                f"SELECT {_select_list(ds, include_long=False)}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" FROM {ds.table} t WHERE {where}"
                f" ORDER BY {sort_expr} {direction}, t.id {direction}"
                f" LIMIT ? OFFSET ?",
                [*params, size, offset],
            ).fetchall()
        ]
        facet_values = facets(conn, ds, project_id)
    return {"items": items, "total": total, "facets": facet_values}


def get_record(dataset: str, record_id: int) -> dict | None:
    ds = get_dataset(dataset)
    with store.connect() as conn:
        row = conn.execute(
            f"SELECT t.project_id, {_select_list(ds)} FROM {ds.table} t"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" WHERE t.id = ? AND t.deleted = 0",
            (record_id,),
        ).fetchone()
        if not row:
            return None
        record = dict(row)
        if dataset == "answers":
            record["citations"] = [
                dict(c)
                for c in conn.execute(
                    "SELECT id, source_platform, source_type, title, url"
                    " FROM geo_citation WHERE run_id = ? AND batch = ?"
                    " AND project_id = ? AND deleted = 0 ORDER BY id",
                    (
                        record["capture_code"],
                        record["batch"],
                        record["project_id"],
                    ),
                ).fetchall()
            ]
        if dataset == "contents" and record.get("url"):
            record["citations"] = [
                dict(c)
                for c in conn.execute(
                    "SELECT c.id, c.ai_platform, c.run_id, c.probe_code,"
                    " c.title, c.url FROM geo_citation c"
                    " WHERE c.url = ? AND c.project_id = ? AND c.deleted = 0"
                    " ORDER BY c.id",
                    (record["url"], record["project_id"]),
                ).fetchall()
            ]
    return record


def _clean_fields(ds: Dataset, fields: dict) -> dict:
    return {
        key: (None if value == "" else value)
        for key, value in fields.items()
        if key in ds.columns
    }


def create_record(dataset: str, project_id: int, fields: dict) -> dict:
    ds = get_dataset(dataset)
    values = _clean_fields(ds, fields)
    values.update(
        project_id=project_id,
        record_id=f"local_{uuid.uuid4().hex}",
        local_edited=1,
    )
    columns = list(values)
    with store.connect() as conn:
        cur = conn.execute(
            f"INSERT INTO {ds.table} ({', '.join(columns)}, updated_at)"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" VALUES ({', '.join('?' for _ in columns)}, datetime('now'))",
            [values[col] for col in columns],
        )
        new_id = int(cur.lastrowid)
    return get_record(dataset, new_id) or {"id": new_id}


def update_record(dataset: str, record_id: int, fields: dict) -> dict | None:
    ds = get_dataset(dataset)
    values = _clean_fields(ds, fields)
    if values:
        assignments = ", ".join(f"{col} = ?" for col in values)
        with store.connect() as conn:
            conn.execute(
                f"UPDATE {ds.table} SET {assignments}, local_edited = 1,"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" updated_at = datetime('now') WHERE id = ? AND deleted = 0",
                [*values.values(), record_id],
            )
    return get_record(dataset, record_id)


def delete_records(dataset: str, ids: list[int]) -> int:
    ds = get_dataset(dataset)
    if not ids:
        return 0
    with store.connect() as conn:
        cur = conn.execute(
            f"UPDATE {ds.table} SET deleted = 1, updated_at = datetime('now')"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" WHERE id IN ({', '.join('?' for _ in ids)}) AND deleted = 0",
            ids,
        )
        return cur.rowcount


def list_projects() -> list[dict]:
    with store.connect() as conn:
        projects = [
            dict(row)
            for row in conn.execute(
                "SELECT id, name, space_id, workspace_root FROM geo_project ORDER BY id"
            ).fetchall()
        ]
        for project in projects:
            pid = project["id"]
            project["counts"] = {
                name: conn.execute(
                    f"SELECT COUNT(*) FROM {ds.table}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                    " WHERE project_id = ? AND deleted = 0",
                    (pid,),
                ).fetchone()[0]
                for name, ds in DATASETS.items()
            }
            project["last_imported_at"] = conn.execute(
                "SELECT MAX(finished_at) FROM geo_import_run"
                " WHERE project_id = ? AND status = 'done'",
                (pid,),
            ).fetchone()[0]
    return projects


def _group(conn, sql: str, params: list, limit: int = 12) -> list[dict]:
    return [dict(row) for row in conn.execute(f"{sql} LIMIT {limit}", params)]


def dashboard(project_id: int) -> dict:
    """Descriptive counts for the dashboard view.

    Scoring such as mention rate or TOP1 rate is intentionally left out until
    the metric definitions are settled.
    """
    p = [project_id]
    live = "project_id = ? AND deleted = 0"
    with store.connect() as conn:
        one = lambda sql: conn.execute(sql, p).fetchone()[0]  # noqa: E731
        totals = {
            "facts": one(f"SELECT COUNT(*) FROM geo_fact WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "answers": one(f"SELECT COUNT(*) FROM geo_answer WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "citations": one(
                f"SELECT COUNT(*) FROM geo_citation WHERE {live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
            ),
            "probes": one(f"SELECT COUNT(*) FROM geo_probe WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "contents": one(f"SELECT COUNT(*) FROM geo_content WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "published": one(
                f"SELECT COUNT(*) FROM geo_content WHERE {live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                " AND status = '已发布'"
            ),
            "cited_contents": one(
                f"SELECT COUNT(*) FROM geo_content t WHERE t.{live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" AND {_CONTENT_CITED} > 0"
            ),
            "answers_with_sources": one(
                f"SELECT COUNT(*) FROM geo_answer t WHERE t.{live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" AND {_ANSWER_CITATIONS} > 0"
            ),
        }
        by = lambda table, col, limit=12: _group(  # noqa: E731
            conn,
            f"SELECT {col} AS label, COUNT(*) AS value FROM {table}"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" WHERE {live} AND {col} IS NOT NULL AND {col} != ''"
            f" GROUP BY {col} ORDER BY value DESC",
            p,
            limit,
        )
        charts = {
            "answers_by_platform": by("geo_answer", "platform"),
            "answers_by_batch": by("geo_answer", "batch"),
            "answers_by_web_search": by("geo_answer", "web_search"),
            "citations_by_ai_platform": by("geo_citation", "ai_platform"),
            "citations_by_type": by("geo_citation", "source_type"),
            "top_source_sites": by("geo_citation", "source_platform", 10),
            "contents_by_platform": by("geo_content", "account_platform"),
            "contents_by_status": by("geo_content", "status"),
            "probes_by_review_status": by("geo_probe", "review_status"),
            "probes_by_cep": by("geo_probe", "cep", 10),
            "cited_contents": _group(
                conn,
                f"SELECT t.id, t.title AS label, {_CONTENT_CITED} AS value"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" FROM geo_content t WHERE t.{live}"
                f" AND {_CONTENT_CITED} > 0 ORDER BY value DESC",
                p,
                10,
            ),
        }
    return {"totals": totals, "charts": charts}


def import_runs(limit: int = 20) -> list[dict]:
    with store.connect() as conn:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT r.id, p.name AS project, r.source, r.table_id, r.status,"
                " r.row_count, r.message, r.started_at, r.finished_at"
                " FROM geo_import_run r LEFT JOIN geo_project p"
                " ON p.id = r.project_id ORDER BY r.id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        ]
