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
"""The GEO metrics, defined once (pipeline contract 1.3).

Diagnosis, tracking, the agents and reports all read them from here.

- Valid answers: non-empty answers in the round to core probes
  (``review_status = '核心探针'``; every probe when none is marked).
- Mention: the answer text names us, by the knowledge base's naming
  entries, colliding names excluded. Read from the text, not from the
  per-answer diagnosis, so every round is judged the same way.
- TOP3, first mention: from the per-answer diagnosis (``own_in_top3``; the
  first brand it lists), over the answers that have one.
- Evidence anchor: in an answer that mentions us, a paragraph that names us
  also holds a match word of a fact with that role.
- Concern, absorbed fact: an answer that mentions us holds a match word of
  a fact with that role anywhere.

Checked against SMA round 2 on the four web platforms: 63 mentions, first
mention 1.6%, concern "跨境" 49/63, as in the 2026-09-28 diagnosis.
- Cited content: published content whose URL, normalised, is a source.

Rates are per platform as well as overall, with answer and distinct probe
counts beside them: the same probe measured on several platforms is not
independent evidence.
"""

import re
import sqlite3
from collections import defaultdict
from urllib.parse import urlsplit

from app.geo import store

CORE_PROBE = "核心探针"
_BRAND_SPLIT = re.compile(r"[、,，;；/|\n]+")
_PARAGRAPH_SPLIT = re.compile(r"\n+")
_ROLE_KEYS = {"证据锚": "anchor", "扣分项": "concern", "核心事实": "absorbed"}


def _words(value: str | None) -> list[str]:
    return [w.strip() for w in (value or "").split("|") if w.strip()]


def knowledge_terms(conn: sqlite3.Connection, project_id: int) -> dict:
    """Our names, colliding names to exclude, and the match words per metric
    role. Naming entries keep the name in ``content``; metric entries keep
    their match words in ``field``."""
    terms: dict[str, list[str]] = {
        "own": [],
        "exclude": [],
        "anchor": [],
        "concern": [],
        "absorbed": [],
    }
    rows = conn.execute(
        "SELECT role, field, content FROM geo_fact"
        " WHERE project_id = ? AND deleted = 0 AND role IS NOT NULL",
        (project_id,),
    ).fetchall()
    for row in rows:
        role = row["role"]
        if role in ("标准名", "首提全称", "别名"):
            terms["own"] += _words(row["content"])
        elif role == "撞名排除":
            terms["exclude"] += _words(row["content"])
        elif role in _ROLE_KEYS:
            terms[_ROLE_KEYS[role]] += _words(row["field"])
    return {key: sorted(set(values)) for key, values in terms.items()}


def _names_us(text: str, terms: dict) -> bool:
    # Colliding names ("托菲儿敏护") are blanked out first, so an alias they
    # contain ("敏护") doesn't count as us.
    lowered = text.lower()
    for name in terms["exclude"]:
        lowered = lowered.replace(name.lower(), " ")
    return any(name.lower() in lowered for name in terms["own"])


def _first_brand_is_us(brands: str | None, top: str | None, terms) -> bool:
    listed = [b.strip() for b in _BRAND_SPLIT.split(brands or "") if b.strip()]
    first = listed[0] if listed else (top or "")
    return bool(first) and _names_us(first, terms)


def _answer_hits(answer: str, words: list[str]) -> bool:
    lowered = (answer or "").lower()
    return any(w.lower() in lowered for w in words)


def _paragraph_hits(answer: str, words: list[str], terms: dict) -> bool:
    if not words:
        return False
    for paragraph in _PARAGRAPH_SPLIT.split(answer or ""):
        if _names_us(paragraph, terms) and any(
            w.lower() in paragraph.lower() for w in words
        ):
            return True
    return False


def normalize_url(url: str | None) -> str:
    """Scheme, ``www.``, query, fragment and a trailing slash don't make a
    different page."""
    raw = (url or "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw if "://" in raw else f"https://{raw}")
    host = (parts.hostname or "").lower().removeprefix("www.")
    path = parts.path.rstrip("/")
    return f"{host}{path}"


def _core_codes(conn: sqlite3.Connection, project_id: int) -> set[str] | None:
    rows = conn.execute(
        "SELECT code FROM geo_probe WHERE project_id = ? AND deleted = 0"
        " AND review_status = ?",
        (project_id, CORE_PROBE),
    ).fetchall()
    return {row["code"] for row in rows} or None


def _answers(
    conn: sqlite3.Connection,
    project_id: int,
    capture_round: str,
    probe_codes: set[str] | None,
) -> list[dict]:
    rows = conn.execute(
        "SELECT a.capture_code, a.probe_code, a.platform, a.answer,"
        " x.id AS analysis_id, x.mentions_own, x.own_in_top3,"
        " x.mentioned_brands, x.top_brand"
        " FROM geo_answer a LEFT JOIN geo_answer_analysis x"
        "  ON x.project_id = a.project_id AND x.capture_code = a.capture_code"
        "  AND x.capture_round = a.capture_round AND x.deleted = 0"
        " WHERE a.project_id = ? AND a.capture_round = ? AND a.deleted = 0"
        " AND TRIM(COALESCE(a.answer, '')) != ''",
        (project_id, capture_round),
    ).fetchall()
    seen: set[str] = set()
    answers = []
    for row in rows:
        if probe_codes is not None and row["probe_code"] not in probe_codes:
            continue
        # A doubled analysis row must not count an answer twice.
        if row["capture_code"] in seen:
            continue
        seen.add(row["capture_code"])
        answers.append(dict(row))
    return answers


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def _summarise(answers: list[dict], terms: dict) -> dict:
    analysed = [a for a in answers if a["analysis_id"] is not None]
    mentioned = [a for a in answers if _names_us(a["answer"], terms)]
    top3 = sum(1 for a in analysed if a["own_in_top3"] == "是")
    first = sum(
        1
        for a in analysed
        if _first_brand_is_us(a["mentioned_brands"], a["top_brand"], terms)
    )
    counts = {
        "anchor": sum(
            1
            for a in mentioned
            if _paragraph_hits(a["answer"], terms["anchor"], terms)
        ),
        **{
            key: sum(
                1 for a in mentioned if _answer_hits(a["answer"], terms[key])
            )
            for key in ("concern", "absorbed")
        },
    }
    result = {
        "answers": len(answers),
        "probes": len({a["probe_code"] for a in answers}),
        "analysed": len(analysed),
        "mentioned": len(mentioned),
        "mention_rate": _rate(len(mentioned), len(answers)),
        "top3": top3,
        "top3_rate": _rate(top3, len(analysed)),
        "first": first,
        "first_rate": _rate(first, len(analysed)),
        **counts,
        "anchor_rate": _rate(counts["anchor"], len(mentioned)),
        "concern_rate": _rate(counts["concern"], len(mentioned)),
        "absorbed_rate": _rate(counts["absorbed"], len(mentioned)),
    }
    if not terms["own"]:
        # Without our names nothing can be read as a mention: unknown, not 0.
        for key in (
            "mentioned",
            "mention_rate",
            "first",
            "first_rate",
            "anchor",
            "anchor_rate",
            "concern",
            "concern_rate",
            "absorbed",
            "absorbed_rate",
        ):
            result[key] = None
    return result


def _cited_content(
    conn: sqlite3.Connection, project_id: int, capture_round: str
) -> dict:
    published = {
        normalize_url(row["url"]): row["id"]
        for row in conn.execute(
            "SELECT id, url FROM geo_content WHERE project_id = ?"
            " AND deleted = 0 AND status = '已发布' AND url IS NOT NULL"
            " AND url != ''",
            (project_id,),
        ).fetchall()
    }
    published.pop("", None)
    citations = 0
    answers: set[str] = set()
    contents: set[int] = set()
    for row in conn.execute(
        "SELECT url, run_id FROM geo_citation WHERE project_id = ?"
        " AND capture_round = ? AND deleted = 0",
        (project_id, capture_round),
    ):
        content_id = published.get(normalize_url(row["url"]))
        if content_id is not None:
            citations += 1
            contents.add(content_id)
            answers.add(row["run_id"])
    return {
        "published": len(published),
        "cited_contents": len(contents),
        "citations": citations,
        "answers": len(answers),
    }


def _round_metrics(
    conn: sqlite3.Connection,
    project_id: int,
    capture_round: str,
    probe_codes: set[str] | None,
    terms: dict,
) -> dict:
    answers = _answers(conn, project_id, capture_round, probe_codes)
    by_platform: dict[str, list[dict]] = defaultdict(list)
    for answer in answers:
        by_platform[answer["platform"] or ""].append(answer)
    return {
        "capture_round": capture_round,
        "overall": _summarise(answers, terms),
        "platforms": [
            {"platform": name, **_summarise(rows, terms)}
            for name, rows in sorted(by_platform.items())
        ],
        "cited_content": _cited_content(conn, project_id, capture_round),
    }


def round_metrics(project_id: int, capture_round: str) -> dict:
    with store.connect(project_id) as conn:
        terms = knowledge_terms(conn, project_id)
        result = _round_metrics(
            conn,
            project_id,
            capture_round,
            _core_codes(conn, project_id),
            terms,
        )
    return {**result, "terms": terms}


def compare_rounds(project_id: int, base_round: str, later_round: str) -> dict:
    """Two rounds over the probes both of them measured, so a changed probe
    set doesn't pass for a change in visibility."""
    with store.connect(project_id) as conn:
        terms = knowledge_terms(conn, project_id)
        core = _core_codes(conn, project_id)

        def measured(name: str) -> set[str]:
            return {
                a["probe_code"]
                for a in _answers(conn, project_id, name, core)
                if a["probe_code"]
            }

        shared = measured(base_round) & measured(later_round)
        rounds = [
            _round_metrics(conn, project_id, name, shared, terms)
            for name in (base_round, later_round)
        ]
    return {"shared_probes": len(shared), "rounds": rounds, "terms": terms}
