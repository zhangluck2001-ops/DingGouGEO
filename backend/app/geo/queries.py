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

from app.geo import rounds, store

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
_ANSWER_OF_ANALYSIS = (
    "(SELECT a.{col} FROM geo_answer a WHERE a.project_id = t.project_id"
    " AND a.capture_code = t.capture_code AND a.capture_round = t.capture_round"
    " AND a.deleted = 0 LIMIT 1)"
)
_ROUND_USAGE = (
    "(SELECT COUNT(*) FROM {table} x WHERE x.project_id = t.project_id"
    " AND x.capture_round = t.name AND x.deleted = 0)"
)
_ANSWER_CITATIONS = (
    "(SELECT COUNT(*) FROM geo_citation c WHERE c.run_id = t.capture_code"
    " AND c.capture_round = t.capture_round AND c.project_id = t.project_id"
    " AND c.deleted = 0)"
)

DATASETS: dict[str, Dataset] = {
    "rounds": Dataset(
        table="geo_capture_round",
        columns=(
            "name",
            "seq",
            "kind",
            "status",
            "started_on",
            "ended_on",
            "probe_scope",
            "platforms",
            "note",
        ),
        search=("name", "note", "probe_scope", "platforms"),
        facets=("kind", "status"),
        default_sort="seq",
        computed={
            "answer_count": _ROUND_USAGE.format(table="geo_answer"),
            "citation_count": _ROUND_USAGE.format(table="geo_citation"),
            "analysis_count": _ROUND_USAGE.format(table="geo_answer_analysis"),
        },
    ),
    "answers": Dataset(
        table="geo_answer",
        columns=(
            "capture_code",
            "probe_code",
            "probe_text",
            "platform",
            "capture_round",
            "probe_group",
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
        facets=("platform", "capture_round", "probe_group", "web_search"),
        default_sort="capture_code",
        computed={"citation_count": _ANSWER_CITATIONS},
    ),
    "analyses": Dataset(
        table="geo_answer_analysis",
        columns=(
            "capture_code",
            "capture_round",
            "mentions_own",
            "mentioned_brands",
            "brand_count",
            "top_brand",
            "own_in_top3",
            "recommend_own",
            "recommend_reason",
            "reason_selling_points",
            "not_recommend_reason",
            "competitor_relation",
            "sentiment",
            "risk_tags",
            "own_rank",
            "anchor_same_para",
            "absorbed_facts",
            "concerns",
        ),
        search=(
            "capture_code",
            "mentioned_brands",
            "top_brand",
            "recommend_reason",
            "not_recommend_reason",
        ),
        facets=(
            "capture_round",
            "mentions_own",
            "recommend_own",
            "own_in_top3",
            "competitor_relation",
            "sentiment",
            "anchor_same_para",
        ),
        default_sort="capture_code",
        computed={
            "platform": _ANSWER_OF_ANALYSIS.format(col="platform"),
            "probe_code": _ANSWER_OF_ANALYSIS.format(col="probe_code"),
            "probe_text": _ANSWER_OF_ANALYSIS.format(col="probe_text"),
        },
    ),
    "citations": Dataset(
        table="geo_citation",
        columns=(
            "run_id",
            "probe_code",
            "ai_platform",
            "capture_round",
            "source_platform",
            "source_type",
            "title",
            "url",
            "domain",
            "capture_date",
        ),
        search=(
            "title",
            "url",
            "domain",
            "source_platform",
            "run_id",
            "probe_code",
        ),
        facets=("ai_platform", "source_type", "capture_round"),
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
            "selling_points",
            "no_go",
            "panel",
            "basis",
            "note",
        ),
        search=("text", "code", "note", "selling_points", "basis"),
        facets=(
            "review_status",
            "direction",
            "cep",
            "category_word",
            "brand_pointer",
            "framework",
            "no_go",
            "panel",
        ),
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
            "role",
            "note",
        ),
        search=("content", "field", "product", "source", "note"),
        facets=("module", "claim_type", "evidence_grade", "product", "role"),
        default_sort="id",
    ),
    "gaps": Dataset(
        table="geo_gap",
        columns=(
            "capture_round",
            "scene",
            "gap_type",
            "platforms",
            "evidence",
            "priority",
            "direction",
            "status",
            "note",
        ),
        search=("scene", "direction", "evidence", "note"),
        facets=("capture_round", "gap_type", "priority", "status"),
        default_sort="id",
    ),
    "benchmarks": Dataset(
        table="geo_benchmark",
        columns=(
            "capture_round",
            "title",
            "url",
            "site",
            "ai_platforms",
            "cited_count",
            "chars",
            "structure",
            "brand_count",
            "archive_path",
            "note",
        ),
        search=("title", "url", "site", "structure", "note"),
        facets=("capture_round", "site"),
        default_sort="id",
    ),
    "contents": Dataset(
        table="geo_content",
        columns=(
            "serial",
            "title",
            "url",
            "channel",
            "account_platform",
            "account_name",
            "status",
            "batch",
            "based_on_round",
            "gap_ids",
            "benchmark_url",
            "target_channel",
            "body_path",
            "qc_status",
            "published_on",
        ),
        search=("title", "account_name", "account_platform", "url", "batch"),
        facets=(
            "channel",
            "account_platform",
            "status",
            "account_name",
            "batch",
            "based_on_round",
            "qc_status",
        ),
        default_sort="serial_num",
        computed={
            "cited_count": _CONTENT_CITED,
            "serial_num": "CAST(t.serial AS INTEGER)",
        },
    ),
}

# Options offered even before any row uses them.
CONTENT_STATUSES = ("草稿", "待发布", "已发布")
QC_STATUSES = ("未验收", "通过", "未通过")
# Knowledge-base roles (pipeline contract 1.3, stage 1). Naming roles tell
# the diagnosis which brand names are ours; the other three name the facts
# the metrics look for. For those, ``field`` holds the match words, "|"
# between alternatives.
NAMING_ROLES = ("标准名", "首提全称", "沿革句", "别名", "撞名排除")
METRIC_ROLES = ("核心事实", "证据锚", "扣分项")
GAP_TYPES = ("未进候选", "进了没首推", "事实错误", "负面顾虑")
GAP_STATUSES = ("待处理", "已排产", "已发布", "已验证")
FIXED_OPTIONS: dict[str, dict[str, tuple[str, ...]]] = {
    "geo_capture_round": {"kind": rounds.KINDS, "status": rounds.STATUSES},
    "geo_content": {
        "status": CONTENT_STATUSES,
        "channel": ("自媒体", "媒体"),
        "qc_status": QC_STATUSES,
    },
    "geo_probe": {
        "brand_pointer": ("L1非品牌指向", "L2品牌指向"),
        "direction": ("正向", "反向"),
        "framework": ("对比", "排名榜单", "求推荐", "求验证"),
        "no_go": ("是", "否"),
    },
    "geo_answer_analysis": {
        "mentions_own": ("是", "否"),
        "recommend_own": ("推荐", "条件推荐", "不推荐", "未提及"),
        "own_in_top3": ("是", "否"),
        "sentiment": ("正向", "负向", "无匹配类别"),
        "anchor_same_para": ("是", "否"),
    },
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
        "role": NAMING_ROLES + METRIC_ROLES,
    },
    "geo_gap": {
        "gap_type": GAP_TYPES,
        "priority": ("高", "中", "低"),
        "status": GAP_STATUSES,
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
        if column == "capture_round":
            result[column] = _round_facet(conn, ds, where, params, project_id)
            continue
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


def _round_facet(conn, ds: Dataset, where: str, params: list, project_id):
    """Every capture round, in round order, with this dataset's row counts."""
    counts = {
        row["value"]: row["count"]
        for row in conn.execute(
            f"SELECT t.capture_round AS value, COUNT(*) AS count"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" FROM {ds.table} t WHERE {where}"
            f" AND t.capture_round IS NOT NULL AND t.capture_round != ''"
            f" GROUP BY t.capture_round",
            params,
        ).fetchall()
    }
    ordered = [
        row["name"]
        for row in conn.execute(
            "SELECT name FROM geo_capture_round WHERE deleted = 0"  # nosec B608 -- placeholders only
            + (" AND project_id = ?" if project_id is not None else "")
            + " ORDER BY seq, id",
            [project_id] if project_id is not None else [],
        ).fetchall()
    ]
    ordered += sorted(value for value in counts if value not in ordered)
    return [{"value": name, "count": counts.get(name, 0)} for name in ordered]


def latest_round(conn, project_id: int) -> str | None:
    row = conn.execute(
        "SELECT name FROM geo_capture_round WHERE project_id = ?"
        " AND deleted = 0 ORDER BY seq DESC, id DESC LIMIT 1",
        (project_id,),
    ).fetchone()
    return row["name"] if row else None


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
    with store.connect(project_id) as conn:
        if ds.table == "geo_capture_round" and project_id is not None:
            rounds.sync(conn, project_id)
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


def get_record(
    dataset: str, record_id: int, project_id: int | None = None
) -> dict | None:
    ds = get_dataset(dataset)
    with store.connect(project_id) as conn:
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
                    " FROM geo_citation WHERE run_id = ? AND capture_round = ?"
                    " AND project_id = ? AND deleted = 0 ORDER BY id",
                    (
                        record["capture_code"],
                        record["capture_round"],
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
    values = {
        key: (None if value == "" else value)
        for key, value in fields.items()
        if key in ds.columns
    }
    if ds.table == "geo_citation" and "url" in values:
        values["domain"] = store.url_domain(values["url"])
    return values


def create_record(dataset: str, project_id: int, fields: dict) -> dict:
    ds = get_dataset(dataset)
    values = _clean_fields(ds, fields)
    values.update(
        project_id=project_id,
        record_id=f"local_{uuid.uuid4().hex}",
        local_edited=1,
    )
    with store.connect(project_id) as conn:
        if ds.table == "geo_capture_round":
            # Number the new round after every round the data already uses.
            rounds.sync(conn, project_id)
            values = rounds.prepare_new(conn, project_id, values)
        elif "capture_round" in ds.columns and not values.get("capture_round"):
            # New captures belong to the latest round unless told otherwise.
            values["capture_round"] = latest_round(conn, project_id)
        columns = list(values)
        cur = conn.execute(
            f"INSERT INTO {ds.table} ({', '.join(columns)}, updated_at)"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" VALUES ({', '.join('?' for _ in columns)}, datetime('now'))",
            [values[col] for col in columns],
        )
        new_id = int(cur.lastrowid)
    if ds.table == "geo_capture_round":
        rounds.ensure_folder(project_id, values["name"])
    return get_record(dataset, new_id, project_id) or {"id": new_id}


def update_record(
    dataset: str, record_id: int, fields: dict, project_id: int | None = None
) -> dict | None:
    ds = get_dataset(dataset)
    values = _clean_fields(ds, fields)
    if values:
        assignments = ", ".join(f"{col} = ?" for col in values)
        with store.connect(project_id) as conn:
            if ds.table == "geo_capture_round" and values.get("name"):
                current = conn.execute(
                    "SELECT project_id, name FROM geo_capture_round"
                    " WHERE id = ? AND deleted = 0",
                    (record_id,),
                ).fetchone()
                if current:
                    rounds.rename(
                        conn,
                        current["project_id"],
                        current["name"],
                        values["name"],
                    )
            conn.execute(
                f"UPDATE {ds.table} SET {assignments}, local_edited = 1,"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" updated_at = datetime('now') WHERE id = ? AND deleted = 0",
                [*values.values(), record_id],
            )
    return get_record(dataset, record_id, project_id)


def delete_records(
    dataset: str, ids: list[int], project_id: int | None = None
) -> int:
    ds = get_dataset(dataset)
    if not ids:
        return 0
    with store.connect(project_id) as conn:
        if ds.table == "geo_capture_round":
            for row in conn.execute(
                f"SELECT project_id, name FROM geo_capture_round"  # nosec B608 -- placeholders only
                f" WHERE id IN ({', '.join('?' for _ in ids)}) AND deleted = 0",
                ids,
            ).fetchall():
                used = rounds.usage(conn, row["project_id"], row["name"])
                if used:
                    raise rounds.RoundInUse(
                        f"「{row['name']}」下还有 {used} 条采集数据，不能删除"
                    )
        cur = conn.execute(
            f"UPDATE {ds.table} SET deleted = 1, updated_at = datetime('now')"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" WHERE id IN ({', '.join('?' for _ in ids)}) AND deleted = 0",
            ids,
        )
        return cur.rowcount


def list_projects() -> list[dict]:
    with store.registry() as conn:
        projects = [
            dict(row)
            for row in conn.execute(
                "SELECT id, name, space_id, workspace_root FROM geo_project ORDER BY id"
            ).fetchall()
        ]
    for project in projects:
        pid = project["id"]
        project["db_path"] = str(store.project_db_path(pid))
        with store.connect(pid) as conn:
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


def dashboard(project_id: int, capture_round: str | None = None) -> dict:
    """Descriptive counts for the dashboard view.

    ``capture_round`` narrows answers, sources, and analyses to one capture
    round; probes, facts, and content are shared by all rounds. Scoring such
    as mention rate or TOP1 rate is intentionally left out until the metric
    definitions are settled.
    """
    live = "project_id = ? AND deleted = 0"
    captured = live + (" AND capture_round = ?" if capture_round else "")
    p = [project_id]
    pc = [project_id, capture_round] if capture_round else p
    cited = _CONTENT_CITED
    if capture_round:
        cited = cited.replace(
            "AND c.url = t.url)", "AND c.url = t.url AND c.capture_round = ?)"
        )
    with store.connect(project_id) as conn:
        rounds.sync(conn, project_id)
        one = lambda sql, params=p: conn.execute(sql, params).fetchone()[0]  # noqa: E731
        totals = {
            "facts": one(f"SELECT COUNT(*) FROM geo_fact WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "answers": one(
                f"SELECT COUNT(*) FROM geo_answer WHERE {captured}",  # nosec B608 -- identifiers come from fixed registries; values are bound
                pc,
            ),
            "citations": one(
                f"SELECT COUNT(*) FROM geo_citation WHERE {captured}",  # nosec B608 -- identifiers come from fixed registries; values are bound
                pc,
            ),
            "probes": one(f"SELECT COUNT(*) FROM geo_probe WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "contents": one(f"SELECT COUNT(*) FROM geo_content WHERE {live}"),  # nosec B608 -- identifiers come from fixed registries; values are bound
            "published": one(
                f"SELECT COUNT(*) FROM geo_content WHERE {live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                " AND status = '已发布'"
            ),
            "cited_contents": one(
                f"SELECT COUNT(*) FROM geo_content t WHERE t.{live}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" AND {cited} > 0",
                pc,
            ),
            "analyses": one(
                f"SELECT COUNT(*) FROM geo_answer_analysis WHERE {captured}",  # nosec B608 -- identifiers come from fixed registries; values are bound
                pc,
            ),
            "mentions_own": one(
                f"SELECT COUNT(*) FROM geo_answer_analysis WHERE {captured}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                " AND mentions_own = '是'",
                pc,
            ),
            "recommends_own": one(
                f"SELECT COUNT(*) FROM geo_answer_analysis WHERE {captured}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                " AND recommend_own IN ('推荐', '条件推荐')",
                pc,
            ),
            "own_in_top3": one(
                f"SELECT COUNT(*) FROM geo_answer_analysis WHERE {captured}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                " AND own_in_top3 = '是'",
                pc,
            ),
            "source_domains": one(
                f"SELECT COUNT(DISTINCT domain) FROM geo_citation WHERE {captured}",  # nosec B608 -- identifiers come from fixed registries; values are bound
                pc,
            ),
            "answers_with_sources": one(
                f"SELECT COUNT(*) FROM geo_answer t WHERE t.{captured}"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" AND {_ANSWER_CITATIONS} > 0",
                pc,
            ),
        }
        by = lambda table, col, limit=12, params=p, where=live: _group(  # noqa: E731
            conn,
            f"SELECT {col} AS label, COUNT(*) AS value FROM {table}"  # nosec B608 -- identifiers come from fixed registries; values are bound
            f" WHERE {where} AND {col} IS NOT NULL AND {col} != ''"
            f" GROUP BY {col} ORDER BY value DESC",
            params,
            limit,
        )
        round_rows = [
            dict(row)
            for row in conn.execute(
                "SELECT t.id, t.name AS label, t.seq, t.kind, t.status,"  # nosec B608 -- fixed SQL fragments; values are bound
                " t.started_on, t.ended_on,"
                f" {_ROUND_USAGE.format(table='geo_answer')} AS value,"
                f" {_ROUND_USAGE.format(table='geo_citation')} AS citations"
                " FROM geo_capture_round t WHERE t.project_id = ?"
                " AND t.deleted = 0 ORDER BY t.seq, t.id",
                p,
            ).fetchall()
        ]
        charts = {
            "answers_by_round": round_rows,
            "answers_by_platform": by(
                "geo_answer", "platform", params=pc, where=captured
            ),
            "answers_by_web_search": by(
                "geo_answer", "web_search", params=pc, where=captured
            ),
            "citations_by_ai_platform": by(
                "geo_citation", "ai_platform", params=pc, where=captured
            ),
            "citations_by_type": by(
                "geo_citation", "source_type", params=pc, where=captured
            ),
            "top_source_sites": by(
                "geo_citation",
                "source_platform",
                10,
                params=pc,
                where=captured,
            ),
            **{
                f"analyses_by_{col}": by(
                    "geo_answer_analysis", col, params=pc, where=captured
                )
                for col in (
                    "mentions_own",
                    "recommend_own",
                    "own_in_top3",
                    "top_brand",
                    "competitor_relation",
                    "sentiment",
                )
            },
            "contents_by_platform": by("geo_content", "account_platform"),
            "contents_by_status": by("geo_content", "status"),
            "probes_by_review_status": by("geo_probe", "review_status"),
            "probes_by_cep": by("geo_probe", "cep", 10),
            "cited_contents": _group(
                conn,
                f"SELECT t.id, t.title AS label, {cited} AS value"  # nosec B608 -- identifiers come from fixed registries; values are bound
                f" FROM geo_content t WHERE t.{live}"
                f" AND {cited} > 0 ORDER BY value DESC",
                (
                    [capture_round, project_id, capture_round]
                    if capture_round
                    else p
                ),
                10,
            ),
        }
    return {"totals": totals, "charts": charts, "rounds": round_rows}


def round_comparison(project_id: int) -> list[dict]:
    """Side-by-side counts per capture round, oldest first.

    Plain counts only; rates wait until the metric definitions are settled.
    """
    per_round = {
        "answers": "SELECT COUNT(*) FROM geo_answer x WHERE {w}",
        "answers_with_sources": (
            "SELECT COUNT(*) FROM geo_answer x WHERE {w} AND EXISTS ("
            "SELECT 1 FROM geo_citation c WHERE c.project_id = x.project_id"
            " AND c.run_id = x.capture_code AND c.capture_round = x.capture_round"
            " AND c.deleted = 0)"
        ),
        "citations": "SELECT COUNT(*) FROM geo_citation x WHERE {w}",
        "source_domains": (
            "SELECT COUNT(DISTINCT x.domain) FROM geo_citation x WHERE {w}"
        ),
        "analyses": "SELECT COUNT(*) FROM geo_answer_analysis x WHERE {w}",
        "mentions_own": (
            "SELECT COUNT(*) FROM geo_answer_analysis x WHERE {w}"
            " AND x.mentions_own = '是'"
        ),
        "recommends_own": (
            "SELECT COUNT(*) FROM geo_answer_analysis x WHERE {w}"
            " AND x.recommend_own IN ('推荐', '条件推荐')"
        ),
        "own_in_top3": (
            "SELECT COUNT(*) FROM geo_answer_analysis x WHERE {w}"
            " AND x.own_in_top3 = '是'"
        ),
        "cited_contents": (
            "SELECT COUNT(*) FROM geo_content t WHERE t.project_id = ?"
            " AND t.deleted = 0 AND t.url IS NOT NULL AND t.url != ''"
            " AND EXISTS (SELECT 1 FROM geo_citation x WHERE {w}"
            " AND x.url = t.url)"
        ),
    }
    where = "x.project_id = ? AND x.deleted = 0 AND x.capture_round = ?"
    with store.connect(project_id) as conn:
        rounds.sync(conn, project_id)
        rows = [
            dict(row)
            for row in conn.execute(
                "SELECT id, name, seq, kind, status, started_on, ended_on"
                " FROM geo_capture_round WHERE project_id = ? AND deleted = 0"
                " ORDER BY seq, id",
                (project_id,),
            ).fetchall()
        ]
        for row in rows:
            for key, sql in per_round.items():
                params = [project_id, row["name"]]
                if key == "cited_contents":
                    params = [project_id, *params]
                row[key] = conn.execute(
                    sql.format(w=where),  # nosec B608 -- fixed SQL fragments; values are bound
                    params,
                ).fetchone()[0]
    return rows


def import_runs(project_id: int, limit: int = 20) -> list[dict]:
    with store.connect(project_id) as conn:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT r.id, p.name AS project, r.source, r.table_id, r.status,"
                " r.row_count, r.message, r.started_at, r.finished_at"
                " FROM geo_import_run r LEFT JOIN geo_project p"
                " ON p.id = r.project_id WHERE r.project_id = ?"
                " ORDER BY r.id DESC LIMIT ?",
                (project_id, limit),
            ).fetchall()
        ]
