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
"""Local SQLite stores for GEO capture data and content records.

Each Space (brand project) keeps its own database at
``<Space folder>/GEO/geo.db``, next to the pipeline folders, so everything a
brand has lives in its Space. ``~/.eigent/geo/geo.db`` is the registry: it
lists the projects and still holds data for projects that have no Space
folder (e.g. imported from Feishu before a Space was made for them).

Rows imported from Feishu keep their ``record_id`` so re-imports upsert
instead of duplicating.
"""

import logging
import os
import re
import shutil
import sqlite3
import threading
from contextlib import contextmanager
from datetime import date
from pathlib import Path

logger = logging.getLogger("geo.store")

GEO_ROOT_FOLDER = "GEO"
SPACE_DB_FILE = "geo.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS geo_project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    feishu_base_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS geo_probe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    code TEXT,
    text TEXT,
    category_word TEXT,
    direction TEXT,
    brand_pointer TEXT,
    review_status TEXT,
    cep TEXT,
    framework TEXT,
    selling_points TEXT,
    no_go TEXT,
    panel TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS geo_answer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    capture_code TEXT,
    probe_code TEXT,
    probe_text TEXT,
    platform TEXT,
    probe_group TEXT,
    capture_round TEXT,
    capture_date TEXT,
    account TEXT,
    answer TEXT,
    web_search TEXT,
    share_url TEXT,
    keywords TEXT,
    category_word TEXT,
    brand_pointer TEXT
);

CREATE TABLE IF NOT EXISTS geo_citation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    run_id TEXT,
    probe_code TEXT,
    ai_platform TEXT,
    capture_round TEXT,
    source_platform TEXT,
    source_type TEXT,
    title TEXT,
    url TEXT,
    domain TEXT,
    capture_date TEXT
);

-- How one captured answer treats the brand: one row per answer, joined to
-- geo_answer on (capture_code, capture_round). Values keep the Feishu wording.
CREATE TABLE IF NOT EXISTS geo_answer_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    capture_code TEXT,
    capture_round TEXT,
    mentions_own TEXT,
    mentioned_brands TEXT,
    brand_count INTEGER,
    top_brand TEXT,
    own_in_top3 TEXT,
    recommend_own TEXT,
    recommend_reason TEXT,
    reason_selling_points TEXT,
    not_recommend_reason TEXT,
    competitor_relation TEXT,
    sentiment TEXT,
    risk_tags TEXT
);

-- One capture wave of the whole probe set: the baseline before optimizing,
-- then a re-capture after each optimization pass. Answers, sources, and
-- analyses name their wave in ``capture_round``.
CREATE TABLE IF NOT EXISTS geo_capture_round (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    seq INTEGER,
    kind TEXT,
    status TEXT,
    started_on TEXT,
    ended_on TEXT,
    probe_scope TEXT,
    platforms TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS geo_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    serial TEXT,
    title TEXT,
    url TEXT,
    channel TEXT,
    account_platform TEXT,
    account_name TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS geo_fact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    module TEXT,
    product TEXT,
    field TEXT,
    content TEXT,
    claim_type TEXT,
    evidence_grade TEXT,
    source TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS geo_kb_source (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    file_name TEXT NOT NULL,
    size INTEGER,
    status TEXT NOT NULL DEFAULT '待清洗',
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    cleaned_at TEXT,
    UNIQUE(project_id, file_name)
);

CREATE TABLE IF NOT EXISTS geo_import_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES geo_project(id),
    source TEXT NOT NULL,
    table_id TEXT,
    status TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);
"""

# Run after ``_migrate`` so older databases already have the renamed columns.
_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_geo_answer_filter
    ON geo_answer(project_id, platform, probe_group, capture_round);
CREATE INDEX IF NOT EXISTS idx_geo_answer_code ON geo_answer(capture_code);
CREATE INDEX IF NOT EXISTS idx_geo_citation_run ON geo_citation(run_id);
CREATE INDEX IF NOT EXISTS idx_geo_citation_url ON geo_citation(url);
CREATE INDEX IF NOT EXISTS idx_geo_analysis_answer
    ON geo_answer_analysis(project_id, capture_code, capture_round);
CREATE INDEX IF NOT EXISTS idx_geo_round_project
    ON geo_capture_round(project_id, seq);
"""

# Tables people can edit in the boards. ``local_edited`` rows keep their
# local values when Feishu is synced again; ``deleted`` is a soft delete so a
# re-sync doesn't bring removed rows back.
RECORD_TABLES = (
    "geo_capture_round",
    "geo_answer",
    "geo_answer_analysis",
    "geo_citation",
    "geo_content",
    "geo_probe",
    "geo_fact",
)
_TRACKING_COLUMNS = {
    "local_edited": "INTEGER NOT NULL DEFAULT 0",
    "deleted": "INTEGER NOT NULL DEFAULT 0",
    "updated_at": "TEXT",
}
# Columns added after the first release; CREATE TABLE IF NOT EXISTS won't add
# them to an existing database.
_ADDED_COLUMNS = {
    "geo_probe": ("selling_points", "no_go", "panel"),
    "geo_citation": ("domain",),
    "geo_content": ("channel",),
}

# Older databases called the capture wave ``batch`` and the probe group
# (NO.1–NO.5, one probe table per account) ``round``.
_RENAMED_COLUMNS = {
    "geo_answer": (("batch", "capture_round"), ("round", "probe_group")),
    "geo_citation": (("batch", "capture_round"),),
    "geo_answer_analysis": (("batch", "capture_round"),),
}
# Tables whose rows belong to one project, moved together into a Space.
PROJECT_TABLES = (*RECORD_TABLES, "geo_kb_source", "geo_import_run")

_URL_HOST = re.compile(r"^https?://([^/?#]+)", re.IGNORECASE)


def url_domain(url: str | None) -> str | None:
    """Host part of a source URL, used to group sources by site."""
    match = _URL_HOST.match((url or "").strip())
    return match.group(1).lower() if match else None


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _migrate(conn: sqlite3.Connection) -> None:
    for table, renames in _RENAMED_COLUMNS.items():
        existing = _columns(conn, table)
        for old, new in renames:
            if old in existing and new not in existing:
                conn.execute(
                    f"ALTER TABLE {table} RENAME COLUMN {old} TO {new}"
                )
    for table in RECORD_TABLES:
        existing = _columns(conn, table)
        for column, ddl in _TRACKING_COLUMNS.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    for table, columns in _ADDED_COLUMNS.items():
        existing = _columns(conn, table)
        for column in columns:
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")
    missing_domain = conn.execute(
        "SELECT id, url FROM geo_citation WHERE domain IS NULL AND url != ''"
    ).fetchall()
    # Skip URLs with no host: rewriting NULL with NULL on every start would
    # still mark the database file as changed.
    updates = [
        (domain, row["id"])
        for row in missing_domain
        if (domain := url_domain(row["url"])) is not None
    ]
    if updates:
        conn.executemany(
            "UPDATE geo_citation SET domain = ? WHERE id = ?", updates
        )
    # A project belongs to the Space (brand) it was created for.
    project_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(geo_project)").fetchall()
    }
    for column in ("space_id", "workspace_root"):
        if column not in project_columns:
            conn.execute(f"ALTER TABLE geo_project ADD COLUMN {column} TEXT")


_lock = threading.Lock()
_initialized_paths: set[str] = set()


def registry_path() -> Path:
    override = os.environ.get("EIGENT_GEO_DB_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".eigent" / "geo" / "geo.db"


def space_db_path(workspace_root: str) -> Path:
    return Path(workspace_root).expanduser() / GEO_ROOT_FOLDER / SPACE_DB_FILE


def _open(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    key = str(path)
    if key not in _initialized_paths:
        with _lock:
            if key not in _initialized_paths:
                conn.executescript(_SCHEMA)
                _migrate(conn)
                conn.executescript(_INDEXES)
                conn.commit()
                _initialized_paths.add(key)
    return conn


@contextmanager
def _session(path: Path):
    conn = _open(path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def registry():
    """The project registry (and data of projects without a Space folder)."""
    return _session(registry_path())


def project_row(project_id: int) -> dict | None:
    with registry() as conn:
        row = conn.execute(
            "SELECT id, name, space_id, workspace_root, feishu_base_token"
            " FROM geo_project WHERE id = ?",
            (project_id,),
        ).fetchone()
    return dict(row) if row else None


def project_db_path(project_id: int) -> Path:
    project = project_row(project_id)
    root = project and project["workspace_root"]
    if root and Path(root).expanduser().is_dir():
        return space_db_path(root)
    return registry_path()


def _mirror_project(conn: sqlite3.Connection, project: dict) -> None:
    """Space databases carry their own project row (foreign keys, agents).

    Written only when it changed: an unchanged database file must stay
    untouched, or every chat turn would report ``geo.db`` as edited.
    """
    keys = ("id", "name", "space_id", "workspace_root", "feishu_base_token")
    row = conn.execute(
        "SELECT id, name, space_id, workspace_root, feishu_base_token"
        " FROM geo_project WHERE id = ?",
        (project["id"],),
    ).fetchone()
    if row is not None and all(row[k] == project[k] for k in keys):
        return
    conn.execute(
        "INSERT INTO geo_project (id, name, space_id, workspace_root,"
        " feishu_base_token) VALUES (:id, :name, :space_id, :workspace_root,"
        " :feishu_base_token) ON CONFLICT(id) DO UPDATE SET"
        " name = excluded.name, space_id = excluded.space_id,"
        " workspace_root = excluded.workspace_root,"
        " feishu_base_token = excluded.feishu_base_token",
        project,
    )


@contextmanager
def connect(project_id: int | None = None):
    """Open the database that holds ``project_id``'s data.

    Without a project this is the registry.
    """
    if project_id is None:
        with registry() as conn:
            yield conn
        return
    path = project_db_path(project_id)
    with _session(path) as conn:
        if path != registry_path():
            project = project_row(project_id)
            if project:
                _mirror_project(conn, project)
        yield conn


def _has_project_rows(conn: sqlite3.Connection, project_id: int) -> bool:
    return any(
        conn.execute(
            f"SELECT 1 FROM {table} WHERE project_id = ? LIMIT 1",  # nosec B608 -- fixed table names
            (project_id,),
        ).fetchone()
        for table in PROJECT_TABLES
    )


def _backup(path: Path) -> None:
    backup = path.with_name(f"{path.name}.bak-{date.today():%Y%m%d}")
    if path.exists() and not backup.exists():
        shutil.copy2(path, backup)


def _vacuum(path: Path) -> None:
    conn = sqlite3.connect(path, timeout=30)
    try:
        conn.execute("VACUUM")
    finally:
        conn.close()


def _transfer(source_id: int, target_id: int) -> dict[str, int]:
    """Move ``source_id``'s rows into ``target_id``'s database, re-keyed to
    ``target_id``. Both databases are backed up first."""
    source = project_db_path(source_id)
    target = project_db_path(target_id)
    if source == target and source_id == target_id:
        return {}
    with connect(source_id) as conn:
        if not _has_project_rows(conn, source_id):
            return {}
    _backup(source)
    _backup(target)
    moved: dict[str, int] = {}
    with connect(target_id) as conn:
        conn.commit()  # ATTACH can't run inside the open transaction
        same_file = source == target
        if not same_file:
            conn.execute("ATTACH DATABASE ? AS source_db", (str(source),))
        src = "main" if same_file else "source_db"
        try:
            for table in PROJECT_TABLES:
                columns = sorted(
                    _columns(conn, table)
                    & {
                        row["name"]
                        for row in conn.execute(
                            f"PRAGMA {src}.table_info({table})"
                        ).fetchall()
                    }
                )
                # Row ids are kept when moving a project as a whole; when
                # merging into another project they may collide, so new ones
                # are assigned.
                if source_id != target_id:
                    columns = [c for c in columns if c != "id"]
                selected = ", ".join(
                    "? AS project_id" if c == "project_id" else c
                    for c in columns
                )
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO main.{table} ({', '.join(columns)})"  # nosec B608 -- fixed table names; columns from PRAGMA
                    f" SELECT {selected} FROM {src}.{table}"
                    f" WHERE project_id = ? ORDER BY id",
                    (target_id, source_id),
                )
                moved[table] = cur.rowcount
                conn.execute(
                    f"DELETE FROM {src}.{table} WHERE project_id = ?",  # nosec B608 -- fixed table names
                    (source_id,),
                )
            conn.commit()
        finally:
            if not same_file:
                conn.execute("DETACH DATABASE source_db")
    if source != target:
        _vacuum(source)
    logger.info(
        "Moved GEO project %s rows into project %s (%s): %s",
        source_id,
        target_id,
        target,
        moved,
    )
    return moved


def move_project_into_space(project_id: int) -> dict[str, int]:
    """Move a project's rows from the registry into its Space database.

    Used when a Space adopts a project that was imported before the Space
    existed. The registry file is copied to ``geo.db.bak-<date>`` first.
    """
    if project_db_path(project_id) == registry_path():
        return {}
    registry_path_ = registry_path()
    with registry() as conn:
        if not _has_project_rows(conn, project_id):
            return {}
    # The rows sit in the registry under the same id: move them as a whole.
    _backup(registry_path_)
    target = project_db_path(project_id)
    moved: dict[str, int] = {}
    with connect(project_id) as conn:
        conn.commit()  # ATTACH can't run inside the open transaction
        conn.execute(
            "ATTACH DATABASE ? AS registry_db", (str(registry_path_),)
        )
        try:
            for table in PROJECT_TABLES:
                columns = sorted(
                    _columns(conn, table)
                    & {
                        row["name"]
                        for row in conn.execute(
                            f"PRAGMA registry_db.table_info({table})"
                        ).fetchall()
                    }
                )
                names = ", ".join(columns)
                cur = conn.execute(
                    f"INSERT OR IGNORE INTO main.{table} ({names})"  # nosec B608 -- fixed table names; columns from PRAGMA
                    f" SELECT {names} FROM registry_db.{table}"
                    f" WHERE project_id = ?",
                    (project_id,),
                )
                moved[table] = cur.rowcount
                conn.execute(
                    f"DELETE FROM registry_db.{table} WHERE project_id = ?",  # nosec B608 -- fixed table names
                    (project_id,),
                )
            conn.commit()
        finally:
            conn.execute("DETACH DATABASE registry_db")
    _vacuum(registry_path_)
    logger.info("Moved GEO project %s into %s: %s", project_id, target, moved)
    return moved


def merge_project_into(source_id: int, target_id: int) -> dict[str, int]:
    """Fold one project's data into another (e.g. history imported under a
    different name into the brand's Space), then drop the source project.

    The target keeps its id, name, and Space; the source's Feishu Base is
    kept if the target has none.
    """
    if source_id == target_id:
        raise ValueError("A project can't be merged into itself")
    source = project_row(source_id)
    target = project_row(target_id)
    if source is None or target is None:
        raise LookupError("GEO project not found")
    moved = _transfer(source_id, target_id)
    with registry() as conn:
        if source["feishu_base_token"] and not target["feishu_base_token"]:
            conn.execute(
                "UPDATE geo_project SET feishu_base_token = ? WHERE id = ?",
                (source["feishu_base_token"], target_id),
            )
        conn.execute("DELETE FROM geo_project WHERE id = ?", (source_id,))
    return moved


def ensure_project(
    conn: sqlite3.Connection, name: str, base_token: str
) -> int:
    row = conn.execute(
        "SELECT id FROM geo_project WHERE name = ?", (name,)
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE geo_project SET feishu_base_token = ? WHERE id = ?",
            (base_token, row["id"]),
        )
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO geo_project (name, feishu_base_token) VALUES (?, ?)",
        (name, base_token),
    )
    return int(cur.lastrowid)


def upsert_rows(conn: sqlite3.Connection, table: str, rows: list[dict]) -> int:
    """Insert or refresh imported rows keyed by ``record_id``.

    Rows a person edited or deleted locally are left untouched.
    """
    if not rows:
        return 0
    columns = list(rows[0].keys())
    placeholders = ", ".join("?" for _ in columns)
    updates = ", ".join(
        f"{col} = excluded.{col}" for col in columns if col != "record_id"
    )
    sql = (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "  # nosec B608 -- identifiers come from fixed registries; values are bound
        f"ON CONFLICT(record_id) DO UPDATE SET {updates}"
        f" WHERE {table}.local_edited = 0 AND {table}.deleted = 0"
    )
    conn.executemany(sql, [tuple(row[col] for col in columns) for row in rows])
    return len(rows)
