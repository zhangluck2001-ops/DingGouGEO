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
"""Capture rounds: one wave of capturing the probe set on the AI platforms.

A brand is captured once as a baseline, then again after every optimization
pass (第一轮 基线 → 优化 → 第二轮 复测 → …). Every answer, source, and
analysis names its round in ``capture_round``; this module keeps the round
list in ``geo_capture_round`` and applies renames to those rows.

Probe groups (NO.1–NO.5, one probe table per capture account) are a
different thing: they split a single round across accounts.
"""

import re
import sqlite3
import uuid
from pathlib import Path

from app.geo import store

KINDS = ("基线", "复测")
STATUSES = ("计划中", "采集中", "已完成")
CAPTURE_FOLDER = "03_AI采集"
# Tables whose rows carry a round name.
ROUND_TABLES = ("geo_answer", "geo_citation", "geo_answer_analysis")

_DIGITS = "零一二三四五六七八九"
_ROUND_NAME = re.compile(r"^第([零一二三四五六七八九十百\d]+)轮")


class RoundInUse(ValueError):
    pass


def chinese_number(n: int) -> str:
    if n < 10:
        return _DIGITS[n]
    if n < 100:
        tens, ones = divmod(n, 10)
        head = "" if tens == 1 else _DIGITS[tens]
        return f"{head}十{_DIGITS[ones] if ones else ''}"
    return str(n)


def parse_seq(name: str | None) -> int | None:
    """第三轮 → 3, 第12轮 → 12; None for names that aren't numbered."""
    match = _ROUND_NAME.match((name or "").strip())
    if not match:
        return None
    text = match.group(1)
    if text.isdigit():
        return int(text)
    if "百" in text:
        return None
    if "十" in text:
        tens, _, ones = text.partition("十")
        return (_DIGITS.index(tens) if tens else 1) * 10 + (
            _DIGITS.index(ones) if ones else 0
        )
    return _DIGITS.index(text) if len(text) == 1 else None


def default_name(seq: int) -> str:
    return f"第{chinese_number(seq)}轮"


def _next_seq(conn: sqlite3.Connection, project_id: int) -> int:
    row = conn.execute(
        "SELECT MAX(seq) FROM geo_capture_round"
        " WHERE project_id = ? AND deleted = 0",
        (project_id,),
    ).fetchone()
    return int(row[0] or 0) + 1


def _existing(conn: sqlite3.Connection, project_id: int) -> set[str]:
    return {
        row["name"]
        for row in conn.execute(
            "SELECT name FROM geo_capture_round"
            " WHERE project_id = ? AND deleted = 0",
            (project_id,),
        ).fetchall()
    }


def sync(conn: sqlite3.Connection, project_id: int) -> list[str]:
    """Add a round for every round name used by captured rows.

    Feishu imports and older databases only know the names; dates come from
    the answers' capture dates.
    """
    known = _existing(conn, project_id)
    used: dict[str, tuple[str | None, str | None]] = {}
    for table in ROUND_TABLES:
        for row in conn.execute(
            f"SELECT DISTINCT capture_round AS name FROM {table}"  # nosec B608 -- fixed table names
            " WHERE project_id = ? AND deleted = 0"
            " AND capture_round IS NOT NULL AND capture_round != ''",
            (project_id,),
        ).fetchall():
            used.setdefault(row["name"], (None, None))
    # A round runs from its first to its last captured answer; source rows
    # carry the page's own date, so they don't count.
    for row in conn.execute(
        "SELECT capture_round AS name, MIN(capture_date) AS first,"
        " MAX(capture_date) AS last FROM geo_answer"
        " WHERE project_id = ? AND deleted = 0 AND capture_date != ''"
        " GROUP BY capture_round",
        (project_id,),
    ).fetchall():
        if row["name"] in used:
            used[row["name"]] = (
                (row["first"] or "")[:10] or None,
                (row["last"] or "")[:10] or None,
            )
    added = []
    for name in sorted(
        (n for n in used if n not in known),
        key=lambda n: (parse_seq(n) is None, parse_seq(n) or 0, n),
    ):
        seq = parse_seq(name) or _next_seq(conn, project_id)
        started, ended = used[name]
        conn.execute(
            "INSERT INTO geo_capture_round (project_id, record_id, name, seq,"
            " kind, status, started_on, ended_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                project_id,
                f"local_{uuid.uuid4().hex}",
                name,
                seq,
                KINDS[0] if seq == 1 else KINDS[1],
                STATUSES[2],
                started,
                ended,
            ),
        )
        added.append(name)
    return added


def prepare_new(
    conn: sqlite3.Connection, project_id: int, values: dict
) -> dict:
    """Fill in number, name, kind, and status for a round being created."""
    seq = values.get("seq")
    seq = int(seq) if seq not in (None, "") else None
    name = (values.get("name") or "").strip()
    if seq is None:
        seq = parse_seq(name) or _next_seq(conn, project_id)
    if not name:
        name = default_name(seq)
    if name in _existing(conn, project_id):
        raise RoundInUse(f"采集轮次「{name}」已存在")
    return {
        **values,
        "name": name,
        "seq": seq,
        "kind": values.get("kind") or (KINDS[0] if seq == 1 else KINDS[1]),
        "status": values.get("status") or STATUSES[0],
    }


def round_folder(project_id: int, name: str) -> Path | None:
    project = store.project_row(project_id)
    root = project and project["workspace_root"]
    if not root or not Path(root).expanduser().is_dir():
        return None
    return (
        Path(root).expanduser() / store.GEO_ROOT_FOLDER / CAPTURE_FOLDER / name
    )


def ensure_folder(project_id: int, name: str) -> None:
    folder = round_folder(project_id, name)
    if folder is not None:
        folder.mkdir(parents=True, exist_ok=True)


def rename(
    conn: sqlite3.Connection, project_id: int, old: str, new: str
) -> None:
    """Rename a round everywhere its name is used, folder included."""
    new = new.strip()
    if not new or new == old:
        return
    if new in _existing(conn, project_id):
        raise RoundInUse(f"采集轮次「{new}」已存在")
    for table in ROUND_TABLES:
        conn.execute(
            f"UPDATE {table} SET capture_round = ?"  # nosec B608 -- fixed table names
            " WHERE project_id = ? AND capture_round = ?",
            (new, project_id, old),
        )
    old_folder = round_folder(project_id, old)
    new_folder = round_folder(project_id, new)
    if (
        old_folder
        and new_folder
        and old_folder.is_dir()
        and not new_folder.exists()
    ):
        old_folder.rename(new_folder)


def usage(conn: sqlite3.Connection, project_id: int, name: str) -> int:
    return sum(
        conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE project_id = ?"  # nosec B608 -- fixed table names
            " AND capture_round = ? AND deleted = 0",
            (project_id, name),
        ).fetchone()[0]
        for table in ROUND_TABLES
    )
