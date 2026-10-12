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
"""Dedicated tools for a Space's GEO database (``GEO/geo.db``).

The agent used to query the database by composing ``sqlite3`` shell
commands. Every shell command counts as a possible write, so in "ask me
first" mode each read needed the user's approval. ``geo_query`` is the
read path Claude Code-style agents get from a database tool: it opens the
file read-only and an SQLite authorizer refuses anything but reading, so it
is declared a safe read and never needs approval.
"""

import sqlite3
from pathlib import Path

from camel.toolkits import FunctionTool
from camel.toolkits.base import BaseToolkit

from app.agent.toolkit.abstract_toolkit import AbstractToolkit
from app.run_policy import ToolSafetyClass
from app.run_runtime.tool_checkpoint import declare_tool_safety

GEO_DATABASE_NAME = "geo.db"
MAX_ROWS = 200
MAX_RESULT_CHARS = 20_000
MAX_CELL_CHARS = 2_000

# Authorizer actions a query may perform; everything else is denied.
_READ_ACTIONS = frozenset(
    {
        sqlite3.SQLITE_SELECT,
        sqlite3.SQLITE_READ,
        sqlite3.SQLITE_FUNCTION,
        sqlite3.SQLITE_RECURSIVE,
    }
)
# PRAGMAs that only describe the schema.
_READ_PRAGMAS = frozenset(
    {
        "table_info",
        "table_xinfo",
        "index_list",
        "index_info",
        "foreign_key_list",
    }
)


def _authorize(action, arg1, _arg2, _db_name, _source):
    if action in _READ_ACTIONS:
        return sqlite3.SQLITE_OK
    if (
        action == sqlite3.SQLITE_PRAGMA
        and (arg1 or "").lower() in _READ_PRAGMAS
    ):
        return sqlite3.SQLITE_OK
    return sqlite3.SQLITE_DENY


def _cell(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\n", " ").replace("|", "\\|")
    if len(text) > MAX_CELL_CHARS:
        text = text[:MAX_CELL_CHARS] + "…"
    return text


class GeoDatabaseToolkit(BaseToolkit, AbstractToolkit):
    def __init__(self, api_task_id: str, timeout: float | None = None):
        super().__init__(timeout=timeout)
        self.api_task_id = api_task_id

    def geo_query(self, db_path: str, sql: str) -> str:
        """Run one read-only SQL query on a Space's GEO database.

        Use this for every read of ``GEO/geo.db`` (counts, lookups, checking
        what was written, ``PRAGMA table_info(...)``) instead of running
        ``sqlite3`` in the terminal: it never needs the user's approval.
        Only reading is allowed; INSERT/UPDATE/DELETE and schema changes
        are refused, so write with the database skill's instructions.

        Args:
            db_path (str): Absolute path of the Space's ``GEO/geo.db``.
            sql (str): One SELECT (or WITH ... SELECT, or a schema PRAGMA
                such as ``PRAGMA table_info(geo_fact)``). Results are capped
                at 200 rows; add LIMIT/WHERE to narrow them.

        Returns:
            str: A Markdown table of the rows, or an error message.
        """
        path = Path(db_path).expanduser()
        if path.name != GEO_DATABASE_NAME or not path.is_file():
            return (
                f"Error: {db_path} is not a GEO database; pass the absolute "
                f"path of the Space's GEO/{GEO_DATABASE_NAME}."
            )
        try:
            conn = sqlite3.connect(
                f"{path.resolve().as_uri()}?mode=ro", uri=True
            )
        except sqlite3.Error as error:
            return f"Error: could not open {db_path}: {error}"
        try:
            conn.set_authorizer(_authorize)
            cursor = conn.execute(sql)
            columns = [d[0] for d in cursor.description or ()]
            rows = cursor.fetchmany(MAX_ROWS + 1)
        except sqlite3.Error as error:
            return (
                f"Error: {error}. Only a single read-only query is allowed "
                "(SELECT, WITH ... SELECT, or a schema PRAGMA)."
            )
        finally:
            conn.close()
        if not columns:
            return "Query returned no columns."
        truncated = len(rows) > MAX_ROWS
        rows = rows[:MAX_ROWS]
        lines = [
            "| " + " | ".join(columns) + " |",
            "|" + "---|" * len(columns),
            *("| " + " | ".join(_cell(v) for v in row) + " |" for row in rows),
        ]
        text = "\n".join(lines)
        if len(text) > MAX_RESULT_CHARS:
            text = (
                text[:MAX_RESULT_CHARS]
                + "\n…（结果过长已截断，加 WHERE/LIMIT 缩小范围）"
            )
        footer = f"\n\n{len(rows)} 行" + (
            f"（只显示前 {MAX_ROWS} 行，加 WHERE/LIMIT 缩小范围）"
            if truncated
            else ""
        )
        return text + footer

    def get_tools(self) -> list[FunctionTool]:
        tool = FunctionTool(self.geo_query)
        declare_tool_safety(tool, ToolSafetyClass.SAFE_READ)
        return [tool]

    @classmethod
    def toolkit_name(cls) -> str:
        return "GEO Database Toolkit"
