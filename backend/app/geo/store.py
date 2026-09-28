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
"""Local SQLite store for GEO capture data and content records.

The database lives under ``~/.eigent/geo/geo.db`` so it stays on the device.
Rows imported from Feishu keep their ``record_id`` so re-imports upsert
instead of duplicating.
"""

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

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
    round TEXT,
    batch TEXT,
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
    batch TEXT,
    source_platform TEXT,
    source_type TEXT,
    title TEXT,
    url TEXT,
    capture_date TEXT
);

CREATE TABLE IF NOT EXISTS geo_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES geo_project(id),
    record_id TEXT NOT NULL UNIQUE,
    serial TEXT,
    title TEXT,
    url TEXT,
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

CREATE INDEX IF NOT EXISTS idx_geo_answer_filter
    ON geo_answer(project_id, platform, round, batch);
CREATE INDEX IF NOT EXISTS idx_geo_answer_code ON geo_answer(capture_code);
CREATE INDEX IF NOT EXISTS idx_geo_citation_run ON geo_citation(run_id);
CREATE INDEX IF NOT EXISTS idx_geo_citation_url ON geo_citation(url);
"""

# Tables people can edit in the boards. ``local_edited`` rows keep their
# local values when Feishu is synced again; ``deleted`` is a soft delete so a
# re-sync doesn't bring removed rows back.
RECORD_TABLES = (
    "geo_answer",
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


def _migrate(conn: sqlite3.Connection) -> None:
    for table in RECORD_TABLES:
        existing = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for column, ddl in _TRACKING_COLUMNS.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
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


def geo_db_path() -> Path:
    override = os.environ.get("EIGENT_GEO_DB_PATH", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".eigent" / "geo" / "geo.db"


@contextmanager
def connect():
    path = geo_db_path()
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
                _initialized_paths.add(key)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


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
