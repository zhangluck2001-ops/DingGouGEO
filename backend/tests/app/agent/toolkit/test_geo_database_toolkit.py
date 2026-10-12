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

import sqlite3

import pytest

from app.agent.toolkit.geo_database_toolkit import (
    MAX_ROWS,
    GeoDatabaseToolkit,
)
from app.permission_policy.tool_actions import operation_for_tool
from app.run_policy import ToolSafetyClass
from app.run_runtime.tool_checkpoint import declared_tool_safety


@pytest.fixture
def geo_db(tmp_path):
    path = tmp_path / "GEO" / "geo.db"
    path.parent.mkdir()
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE geo_fact (id INTEGER PRIMARY KEY, content TEXT)"
    )
    conn.executemany(
        "INSERT INTO geo_fact (content) VALUES (?)",
        [(f"事实 {i}",) for i in range(MAX_ROWS + 5)],
    )
    conn.commit()
    conn.close()
    return path


@pytest.fixture
def toolkit():
    return GeoDatabaseToolkit("project-1")


def test_reads_rows_and_schema(geo_db, toolkit):
    rows = toolkit.geo_query(
        str(geo_db), "SELECT id, content FROM geo_fact WHERE id <= 2"
    )
    assert "| id | content |" in rows
    assert "| 1 | 事实 0 |" in rows
    schema = toolkit.geo_query(str(geo_db), "PRAGMA table_info(geo_fact)")
    assert "content" in schema


def test_caps_the_number_of_rows(geo_db, toolkit):
    result = toolkit.geo_query(str(geo_db), "SELECT * FROM geo_fact")
    assert f"只显示前 {MAX_ROWS} 行" in result


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO geo_fact (content) VALUES ('x')",
        "UPDATE geo_fact SET content = 'x'",
        "DELETE FROM geo_fact",
        "DROP TABLE geo_fact",
        "ATTACH DATABASE '/tmp/other.db' AS other",
        "PRAGMA journal_mode = DELETE",
        "SELECT 1; DELETE FROM geo_fact",
    ],
)
def test_refuses_anything_but_reading(geo_db, toolkit, sql):
    assert toolkit.geo_query(str(geo_db), sql).startswith("Error:")
    conn = sqlite3.connect(geo_db)
    assert conn.execute("SELECT COUNT(*) FROM geo_fact").fetchone()[0] == (
        MAX_ROWS + 5
    )
    conn.close()


def test_only_opens_geo_databases(tmp_path, toolkit):
    other = tmp_path / "run-journal.sqlite3"
    sqlite3.connect(other).close()
    assert toolkit.geo_query(str(other), "SELECT 1").startswith("Error:")


def test_is_a_safe_read_that_needs_no_approval(toolkit):
    (tool,) = toolkit.get_tools()
    safety, _ = declared_tool_safety(tool, "geo_query", {})
    assert safety is ToolSafetyClass.SAFE_READ
    assert operation_for_tool(
        "geo_query", safety, toolkit_name=GeoDatabaseToolkit.toolkit_name()
    ).endswith(".read")
