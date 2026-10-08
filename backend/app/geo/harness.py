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
"""What the DingGouGEO agents are made of, apart from the prompt text.

Shaped after the Claude Code harness: one root agent talks to the user and
orchestrates; each GEO stage has a sub-agent type the root delegates batch
work to; the context budget follows the model that is plugged in. The prompt
text built from these declarations lives in ``agent_prompt``.
"""

import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.geo import store

logger = logging.getLogger("geo.harness")


@dataclass(frozen=True)
class Stage:
    """One link of the GEO pipeline and the sub-agent type that works on it."""

    seq: int
    key: str
    name: str
    folder: str
    duty: str
    writes: str
    subagent_type: str
    # Skills this stage loads before working; empty until they are plugged in.
    skills: tuple[str, ...] = ()


STAGES: tuple[Stage, ...] = (
    Stage(
        1,
        "knowledge",
        "品牌知识库",
        "01_品牌知识库",
        "按 `01_品牌知识库/清洗规则.md` 把 `原始资料/` 清洗成原子事实，"
        "标事实/宣称/话术和证据等级 A–E",
        "七个模块文件 + 表 `geo_fact`；资料状态在 `geo_kb_source`",
        "geo-knowledge",
    ),
    Stage(
        2,
        "probes",
        "意图探针",
        "02_意图探针",
        "探针由用户决定。按用户给的方向、依据知识库起草，用户确认后才入库",
        "表 `geo_probe`，`02_意图探针/`",
        "geo-probes",
    ),
    Stage(
        3,
        "capture",
        "AI 采集",
        "03_AI采集",
        "采集由用户或采集工具执行，按采集轮次记录（第一轮是优化前基线，"
        "之后每次优化后复测一轮）。负责建轮次、查进度、核对数据",
        "表 `geo_capture_round`、`geo_answer`、`geo_citation`；"
        "`03_AI采集/<轮次名>/`",
        "geo-capture",
    ),
    Stage(
        4,
        "analysis",
        "诊断分析",
        "04_诊断分析",
        "逐条读回答，标注是否提及自有品、首推品牌、TOP3、推荐理由、竞品同框、"
        "情感、风险；再写本轮结论",
        "表 `geo_answer_analysis`，`04_诊断分析/`",
        "geo-analysis",
    ),
    Stage(
        5,
        "citations",
        "引用来源",
        "05_引用来源",
        "统计 AI 引用的站点和域名，看我方内容是否被引用，给投放渠道建议",
        "`05_引用来源/`",
        "geo-citations",
    ),
    Stage(
        6,
        "content",
        "内容生产",
        "06_内容生产",
        "按诊断出的缺口和渠道建议写底稿和多个标题，做合规与证据自查",
        "`06_内容生产/`，表 `geo_content`（状态「草稿」）",
        "geo-content",
    ),
    Stage(
        7,
        "publish",
        "内容发布",
        "07_内容发布",
        "发布由真人完成；只记录平台、账号、链接、日期",
        "表 `geo_content`（状态「已发布」），`07_内容发布/`",
        "geo-publish",
    ),
    Stage(
        8,
        "tracking",
        "效果追踪",
        "08_效果追踪",
        "对比各采集轮次，看已发布内容是否被 AI 引用，写阶段报告",
        "`08_效果追踪/`",
        "geo-tracking",
    ),
)


def stage_for_subagent(subagent_type: str) -> Stage | None:
    wanted = (subagent_type or "").strip().lower()
    return next((s for s in STAGES if s.subagent_type == wanted), None)


ROOT_AGENT_NAME = "GEO Agent"


def agents_overview() -> dict:
    """The agents of DingGouGEO as the settings page shows them: the GEO
    Agent with the tool groups it is built with, then one agent per stage."""
    # Imported here: the assembler pulls in the agent package, which imports
    # the GEO prompt module, which imports this one.
    from app.agent.factory.toolkit_assembler import (
        DEFAULT_SINGLE_AGENT_TOOLKIT_CONFIG,
    )

    tools = [
        name
        for name, value in DEFAULT_SINGLE_AGENT_TOOLKIT_CONFIG.items()
        if not isinstance(value, dict) or value.get("enabled", True)
    ]
    return {
        "root": {"name": ROOT_AGENT_NAME, "tools": ["memory", *tools]},
        "stages": [
            {
                "seq": s.seq,
                "key": s.key,
                "name": s.name,
                "folder": s.folder,
                "duty": s.duty,
                "writes": s.writes,
                "subagent_type": s.subagent_type,
                "skills": list(s.skills),
            }
            for s in STAGES
        ],
    }


# ---- Context budget ---------------------------------------------------------
#
# CAMEL compacts a conversation once it passes ``summarize_threshold`` percent
# of the agent's ``token_limit``, and takes that limit from its own model
# list. Models it doesn't know get 999_999_999, which switches compaction off
# and lets a long run grow until the provider rejects the request. So the
# limit is set here, from the model's real context window.

# Even a million-token window is not worth filling: every request resends the
# whole context, and answers get worse long before the window is full.
_WORKING_WINDOW_CAP = 200_000
_SUMMARIZE_THRESHOLD = 80
_UNKNOWN_TOKEN_LIMIT = 999_999_999
_PROFILES_FILE = "model_profiles.json"


@dataclass(frozen=True)
class ContextBudget:
    context_window: int
    token_limit: int
    summarize_threshold: int = _SUMMARIZE_THRESHOLD


def _read_profiles(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        logger.warning("Unreadable model profiles: %s", path, exc_info=True)
        return {}
    return data if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def _builtin_profiles() -> dict:
    return _read_profiles(Path(__file__).with_name(_PROFILES_FILE))


def _user_profiles() -> dict:
    """Per-machine additions in ``~/.eigent/geo/model_profiles.json``, same
    shape as the built-in file; they win over it."""
    return _read_profiles(store.registry_path().parent / _PROFILES_FILE)


def _window(value: object) -> int | None:
    # bool is an int; a stray ``true`` must not become a 1-token window.
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _declared_window(
    profiles: dict, model_platform: str, model_type: str
) -> int | None:
    """Longest ``model_type`` prefix wins, so dated variants of a model
    (``name-2026-08-01``) share its entry."""
    best: tuple[int, int] | None = None
    for entry in profiles.get("models") or []:
        if not isinstance(entry, dict):
            continue
        prefix = str(entry.get("model_type") or "").strip().lower()
        platform = str(entry.get("model_platform") or "").strip().lower()
        window = _window(entry.get("context_window"))
        if not prefix or window is None or not model_type.startswith(prefix):
            continue
        if platform and platform != model_platform:
            continue
        if best is None or len(prefix) > best[0]:
            best = (len(prefix), window)
    return best[1] if best else None


def _default_window(profiles: dict) -> int | None:
    default = profiles.get("default")
    if not isinstance(default, dict):
        return None
    return _window(default.get("context_window"))


def _camel_window(model_type: str) -> int | None:
    try:
        from camel.types import ModelType

        limit = ModelType(model_type).token_limit
    except Exception:  # noqa: BLE001 — not in CAMEL's list
        return None
    return limit if 0 < limit < _UNKNOWN_TOKEN_LIMIT else None


def _working_cap() -> int:
    raw = os.environ.get("GEO_AGENT_WORKING_WINDOW", "")
    try:
        value = int(raw)
    except ValueError:
        return _WORKING_WINDOW_CAP
    return value if value > 0 else _WORKING_WINDOW_CAP


def context_budget(model_platform: str, model_type: str) -> ContextBudget:
    """How much context the agent may hold before it compacts.

    The context window comes from, in order: the user's profile file, the
    built-in one, CAMEL's model list, then the default for unknown models.
    """
    platform = (model_platform or "").strip().lower()
    model = (model_type or "").strip().lower()
    user, builtin = _user_profiles(), _builtin_profiles()
    window = (
        _declared_window(user, platform, model)
        or _declared_window(builtin, platform, model)
        or _camel_window(model)
        or _default_window(user)
        or _default_window(builtin)
        or 128_000
    )
    return ContextBudget(
        context_window=window,
        token_limit=min(window, _working_cap()),
    )
