#!/usr/bin/env python3
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

"""Snapshot and diff a GEO Space for hands-on testing.

Take a snapshot before and after each step a person does in the app, then diff
the two to see exactly what the step changed:

  python3 scripts/geo_observe.py spaces
  python3 scripts/geo_observe.py snap "上传资料前"
  python3 scripts/geo_observe.py snap "上传资料后"
  python3 scripts/geo_observe.py diff            # the two latest snapshots
  python3 scripts/geo_observe.py diff 3 5        # snapshot 3 → snapshot 5
  python3 scripts/geo_observe.py diff 0 1        # empty Space → snapshot 1
  python3 scripts/geo_observe.py list

A snapshot records the Space's ``GEO/`` files (size and hash), the row count
and highest rowid of every table in the Space database, and the time. A diff
shows added/removed/changed files, new and changed table rows, and the agent
runs, tool calls and model calls recorded in the run journal between the two
snapshots. The project defaults to the newest one in the registry; pass
``--project ID`` to pick another.

Snapshots hold client data, so they live in ``~/.eigent/geo/observe/``,
outside the repository. Read-only: the script never writes to the app's data.
"""

import argparse
import hashlib
import json
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

EIGENT = Path.home() / ".eigent"
REGISTRY_DB = EIGENT / "geo" / "geo.db"
RUN_JOURNAL = EIGENT / "run-journal.sqlite3"
OBSERVE_DIR = EIGENT / "geo" / "observe"
GEO_FOLDER = "GEO"
SKIP_SUFFIXES = (".db-wal", ".db-shm", ".db-journal", ".DS_Store")
MAX_ROWS_SHOWN = 8
MAX_CELL = 80


def _ro(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _projects() -> list[dict]:
    with _ro(REGISTRY_DB) as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT id, name, space_id, workspace_root FROM geo_project"
                " ORDER BY id"
            )
        ]


def _project(project_id: int | None) -> dict:
    projects = _projects()
    if not projects:
        sys.exit("注册表里还没有项目。")
    if project_id is None:
        return projects[-1]
    for p in projects:
        if p["id"] == project_id:
            return p
    sys.exit(f"找不到项目 {project_id}，可用：{[p['id'] for p in projects]}")


def _geo_root(project: dict) -> Path | None:
    root = project.get("workspace_root")
    return Path(root).expanduser() / GEO_FOLDER if root else None


def _files(geo_root: Path | None) -> dict[str, dict]:
    if not geo_root or not geo_root.is_dir():
        return {}
    out = {}
    for path in sorted(geo_root.rglob("*")):
        if not path.is_file() or path.name.endswith(SKIP_SUFFIXES):
            continue
        data = path.read_bytes()
        out[str(path.relative_to(geo_root))] = {
            "size": len(data),
            "sha1": hashlib.sha1(data).hexdigest()[:12],
        }
    return out


def _db_path(project: dict) -> Path:
    geo_root = _geo_root(project)
    if geo_root and (geo_root / "geo.db").exists():
        return geo_root / "geo.db"
    return REGISTRY_DB


def _tables(db: Path, project_id: int) -> dict[str, dict]:
    if not db.exists():
        return {}
    out = {}
    with _ro(db) as conn:
        names = [
            r["name"]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
                " AND name LIKE 'geo_%' ORDER BY name"
            )
        ]
        for name in names:
            cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({name})")]
            where = " WHERE project_id = ?" if "project_id" in cols else ""
            args = (project_id,) if where else ()
            row = conn.execute(
                f"SELECT COUNT(*) AS n, COALESCE(MAX(rowid), 0) AS m FROM {name}{where}",
                args,
            ).fetchone()
            # Row digests catch in-place updates (e.g. a status change).
            digests = {
                str(r[0]): hashlib.sha1(
                    json.dumps(list(r[1:]), default=str).encode()
                ).hexdigest()[:10]
                for r in conn.execute(f"SELECT rowid, * FROM {name}{where}", args)
            }
            out[name] = {"count": row["n"], "max_rowid": row["m"], "rows": digests}
    return out


def _snap_dir(project_id: int) -> Path:
    path = OBSERVE_DIR / f"project_{project_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _snapshots(project_id: int) -> list[Path]:
    return sorted(
        _snap_dir(project_id).glob("*.json"), key=lambda p: int(p.name.split("-")[0])
    )


def cmd_spaces(_args) -> None:
    for p in _projects():
        geo_root = _geo_root(p)
        ok = "有" if geo_root and geo_root.is_dir() else "无"
        print(f"[{p['id']}] {p['name']}  space={p['space_id']}  GEO 文件夹:{ok}")
        print(f"     {p['workspace_root']}")


def cmd_snap(args) -> None:
    project = _project(args.project)
    existing = _snapshots(project["id"])
    number = int(existing[-1].name.split("-")[0]) + 1 if existing else 1
    snap = {
        "number": number,
        "label": args.label,
        "taken_at": time.time(),
        "project": project,
        "db": str(_db_path(project)),
        "files": _files(_geo_root(project)),
        "tables": _tables(_db_path(project), project["id"]),
    }
    safe = "".join(c if c.isalnum() else "_" for c in args.label)[:40]
    path = _snap_dir(project["id"]) / f"{number}-{safe}.json"
    path.write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = ", ".join(
        f"{k.removeprefix('geo_')}={v['count']}"
        for k, v in snap["tables"].items()
        if v["count"]
    )
    print(f"快照 #{number}「{args.label}」 项目 [{project['id']}] {project['name']}")
    print(f"  文件 {len(snap['files'])} 个；有数据的表：{counts or '无'}")


def cmd_list(args) -> None:
    project = _project(args.project)
    for path in _snapshots(project["id"]):
        snap = json.loads(path.read_text(encoding="utf-8"))
        when = datetime.fromtimestamp(snap["taken_at"]).strftime("%m-%d %H:%M:%S")
        print(f"#{snap['number']:>3}  {when}  {snap['label']}")


EMPTY_SNAPSHOT = {"number": 0, "label": "空白", "taken_at": None, "files": {}, "tables": {}}


def _load(project_id: int, number: int | None, fallback_index: int) -> dict:
    snaps = _snapshots(project_id)
    if number == 0:
        return EMPTY_SNAPSHOT
    if number is None:
        if not snaps:
            sys.exit("还没有快照，先用 snap 拍一张。")
        if len(snaps) < abs(fallback_index):
            return EMPTY_SNAPSHOT  # one snapshot: compare it with an empty Space
        path = snaps[fallback_index]
    else:
        matches = [p for p in snaps if p.name.split("-")[0] == str(number)]
        if not matches:
            sys.exit(f"没有快照 #{number}")
        path = matches[0]
    return json.loads(path.read_text(encoding="utf-8"))


def _cell(value) -> str:
    text = str(value).replace("\n", " ")
    return text if len(text) <= MAX_CELL else text[: MAX_CELL - 1] + "…"


def _print_rows(db: Path, table: str, rowids: list[str]) -> None:
    if not rowids or not db.exists():
        return
    shown = rowids[:MAX_ROWS_SHOWN]
    marks = ",".join("?" * len(shown))
    with _ro(db) as conn:
        for row in conn.execute(
            f"SELECT rowid AS _rowid, * FROM {table} WHERE rowid IN ({marks})", shown
        ):
            fields = {
                k: row[k]
                for k in row.keys()
                if k not in ("project_id",) and row[k] not in (None, "")
            }
            print("      · " + "  ".join(f"{k}={_cell(v)}" for k, v in fields.items()))
    if len(rowids) > MAX_ROWS_SHOWN:
        print(f"      … 另有 {len(rowids) - MAX_ROWS_SHOWN} 行")


def _diff_files(a: dict, b: dict) -> None:
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    changed = sorted(k for k in set(a) & set(b) if a[k]["sha1"] != b[k]["sha1"])
    print(f"\n■ 文件  新增 {len(added)} · 删除 {len(removed)} · 修改 {len(changed)}")
    for k in added:
        print(f"  + {k}  ({b[k]['size']} B)")
    for k in removed:
        print(f"  - {k}")
    for k in changed:
        print(f"  ~ {k}  ({a[k]['size']} → {b[k]['size']} B)")


def _diff_tables(a: dict, b: dict, db: Path, show_rows: bool) -> None:
    print("\n■ 数据库表")
    quiet = True
    for name in sorted(set(a) | set(b)):
        ta = a.get(name, {"count": 0, "rows": {}})
        tb = b.get(name, {"count": 0, "rows": {}})
        new = [r for r in tb["rows"] if r not in ta["rows"]]
        gone = [r for r in ta["rows"] if r not in tb["rows"]]
        updated = [
            r for r in tb["rows"] if r in ta["rows"] and ta["rows"][r] != tb["rows"][r]
        ]
        if not (new or gone or updated):
            continue
        quiet = False
        print(
            f"  {name}: {ta['count']} → {tb['count']}"
            f"  (新增 {len(new)} · 删除 {len(gone)} · 改动 {len(updated)})"
        )
        if show_rows:
            _print_rows(db, name, new + updated)
    if quiet:
        print("  无变化")


def _diff_journal(start: float, end: float) -> None:
    print("\n■ 智能体运行（run-journal，两次快照之间）")
    if not RUN_JOURNAL.exists():
        print("  找不到 run-journal")
        return
    with _ro(RUN_JOURNAL) as conn:
        runs = conn.execute(
            "SELECT run_id, project_id, status, created_at, updated_at FROM runs"
            " WHERE updated_at BETWEEN ? AND ? ORDER BY created_at",
            (start, end),
        ).fetchall()
        if not runs:
            print("  没有运行")
            return
        for run in runs:
            began = datetime.fromtimestamp(run["created_at"]).strftime("%H:%M:%S")
            print(f"  run {run['run_id']}  {run['status']}  开始 {began}")
            tools = conn.execute(
                "SELECT tool_name, status, COUNT(*) AS n FROM tool_calls"
                " WHERE run_id = ? AND created_at BETWEEN ? AND ?"
                " GROUP BY tool_name, status ORDER BY n DESC",
                (run["run_id"], start, end),
            ).fetchall()
            if tools:
                print(
                    "    工具："
                    + "；".join(f"{t['tool_name']}({t['status']})×{t['n']}" for t in tools)
                )
            calls = conn.execute(
                "SELECT agent_id, model, status, COUNT(*) AS n,"
                " SUM(COALESCE(prompt_tokens,0)) AS pt,"
                " SUM(COALESCE(completion_tokens,0)) AS ct,"
                " GROUP_CONCAT(DISTINCT error_message) AS errors"
                " FROM model_invocations WHERE run_id = ?"
                " AND started_at BETWEEN ? AND ? GROUP BY agent_id, model, status",
                (run["run_id"], start, end),
            ).fetchall()
            for c in calls:
                line = (
                    f"    模型：{c['agent_id']} · {c['model']} · {c['status']} ×{c['n']}"
                    f"  tokens 入 {c['pt']} / 出 {c['ct']}"
                )
                print(line)
                if c["errors"]:
                    print(f"      错误：{_cell(c['errors'])}")


def cmd_diff(args) -> None:
    project = _project(args.project)
    a = _load(project["id"], args.a, -2)
    b = _load(project["id"], args.b, -1)
    fmt = "%m-%d %H:%M:%S"

    def when(snap: dict) -> str:
        t = snap["taken_at"]
        return datetime.fromtimestamp(t).strftime(fmt) if t else "—"

    print(
        f"项目 [{project['id']}] {project['name']}\n"
        f"#{a['number']}「{a['label']}」 {when(a)}  →  #{b['number']}「{b['label']}」 {when(b)}"
    )
    _diff_files(a["files"], b["files"])
    _diff_tables(a["tables"], b["tables"], Path(b["db"]), not args.counts_only)
    if a["taken_at"]:
        _diff_journal(a["taken_at"], b["taken_at"])
    else:
        print("\n■ 智能体运行：和空白比时不看（没有起始时间）")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--project", type=int, help="项目 id，默认最新建的项目")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("spaces", help="列出注册表里的项目")
    snap = sub.add_parser("snap", help="拍一张快照")
    snap.add_argument("label", help="这一步的名字，如「上传资料后」")
    sub.add_parser("list", help="列出已有快照")
    diff = sub.add_parser("diff", help="对比两张快照，默认最近两张")
    diff.add_argument("a", type=int, nargs="?")
    diff.add_argument("b", type=int, nargs="?")
    diff.add_argument("--counts-only", action="store_true", help="只看行数，不列新行")
    args = parser.parse_args()
    {"spaces": cmd_spaces, "snap": cmd_snap, "list": cmd_list, "diff": cmd_diff}[
        args.cmd
    ](args)


if __name__ == "__main__":
    main()
