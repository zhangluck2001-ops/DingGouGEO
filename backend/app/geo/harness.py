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
    """One link of the GEO pipeline, as the pipeline contract
    (``docs/GEO-链路契约.md``) defines it, and the sub-agent type that works
    on it. Prompts, the stage pages' hand-off instructions and the agents
    settings page are all built from these."""

    seq: int
    key: str
    name: str
    folder: str
    inputs: str
    duty: str
    writes: str
    done: str
    subagent_type: str
    # Skills this stage loads before working; empty until they are plugged in.
    skills: tuple[str, ...] = ()


STAGES: tuple[Stage, ...] = (
    Stage(
        seq=1,
        key="knowledge",
        name="品牌知识库",
        folder="01_品牌知识库",
        inputs="`原始资料/` 里的品牌方资料、官网页面、标签、检测报告、文献表、客服问答",
        duty="按 `01_品牌知识库/清洗规则.md` 把原始资料清洗成原子事实"
        "（读 `原始资料解析/` 里程序转好的文字和图片），标类型和证据等级 A–E；"
        "补齐命名条目和指标条目",
        writes="七个模块文件、`02_产品库/<产品名>.md` + 表 `geo_fact`；"
        "资料状态在 `geo_kb_source`",
        done="原始资料全部「已清洗」；七个模块都不是模板；有标准名、首提全称；"
        "每条事实有证据等级和来源（原件文件名 + 位置）；"
        "功效、临床类宣称带 DOI 或官方 URL，没有的标明缺口；合规红线模块不为空",
        subagent_type="geo-knowledge",
    ),
    Stage(
        seq=2,
        key="probes",
        name="意图探针",
        folder="02_意图探针",
        inputs="知识库（品类词、CEP、卖点、竞品）、真实咨询、上一轮 0 提及的场景",
        duty="探针由用户决定。按用户给的方向、依据知识库起草，用户确认后才入库；"
        "核心探针只收非品牌、求推荐型",
        writes="表 `geo_probe`，`02_意图探针/`",
        done="核心探针全部审校通过；每条有 CEP 和真实咨询依据；"
        "不含品牌名、排除本品的条件和卖点指向词；相似题已去重；各组数量均衡",
        subagent_type="geo-probes",
    ),
    Stage(
        seq=3,
        key="capture",
        name="AI 采集",
        folder="03_AI采集",
        inputs="本轮探针集、平台列表、各组账号的登录 profile",
        duty="采集由用户或采集工具执行，按采集轮次记录（第一轮是优化前基线，"
        "之后每次优化后复测一轮）。负责建轮次、导入结果、核对数据",
        writes="表 `geo_capture_round`、`geo_answer`、`geo_citation`；"
        "`03_AI采集/<轮次名>/`",
        done="探针 × 平台覆盖率 100%，否则列出缺口；回答非空、不是问题回声；"
        "分享链接是公开域名；没有重复；每条来源都挂在有效回答上",
        subagent_type="geo-capture",
    ),
    Stage(
        seq=4,
        key="analysis",
        name="诊断分析",
        folder="04_诊断分析",
        inputs="本轮回答；知识库的命名条目、卖点、证据锚、扣分项；上一轮诊断",
        duty="逐条读回答，标注是否提及自有品、首推品牌、TOP3、推荐理由、竞品同框、"
        "情感、风险；按统一口径看指标；归纳缺口；写本轮结论",
        writes="表 `geo_answer_analysis`、`geo_gap`，`04_诊断分析/<轮次名>.md`",
        done="本轮有效回答 100% 有逐条诊断；抽检 10% 有记录；"
        "指标按统一口径并披露分母；每个缺口都能追到具体回答",
        subagent_type="geo-analysis",
    ),
    Stage(
        seq=5,
        key="citations",
        name="引用来源",
        folder="05_引用来源",
        inputs="本轮引用来源和回答",
        duty="统计各平台引用的站点和域名，挑出高被引原文入对标库并拆解结构，"
        "看我方内容是否被引用，给投放渠道建议",
        writes="表 `geo_benchmark`，`05_引用来源/<轮次名>.md`",
        done="每个平台有站点 Top N；对标原文已抓到正文并拆出结构；"
        "每个平台都有渠道建议",
        subagent_type="geo-citations",
    ),
    Stage(
        seq=6,
        key="content",
        name="内容生产",
        folder="06_内容生产",
        inputs="缺口（`geo_gap`）、对标库（`geo_benchmark`）和渠道建议、"
        "知识库的事实、证据、命名、红线",
        duty="每篇先写对标模板卡，再照对标原文的结构写稿、出 3 个标题，"
        "只用知识库里的事实，过验收闸门",
        writes="`06_内容生产/<批次>/`，表 `geo_content`（批次、依据轮次、对应缺口、"
        "对标原文、正文文件、验收状态）",
        done="验收闸门硬项全部通过，任一项不过不交付；闸门原始输出附在交付说明里",
        subagent_type="geo-content",
    ),
    Stage(
        seq=7,
        key="publish",
        name="内容发布",
        folder="07_内容发布",
        inputs="验收通过的稿件；平台与 AI 的对应关系",
        duty="发布由真人完成；生成发布计划，记录平台、账号、链接、日期",
        writes="`07_内容发布/<批次>发布计划.md`，表 `geo_content`（状态「已发布」、"
        "发布日期）",
        done="每篇有链接和日期；链接能打开；同一稿没有在同一平台发两次",
        subagent_type="geo-publish",
    ),
    Stage(
        seq=8,
        key="tracking",
        name="效果追踪",
        folder="08_效果追踪",
        inputs="两轮或以上的指标、已发布内容、引用来源",
        duty="按统一口径对比各采集轮次（只比两轮都测过的探针），"
        "看已发布内容是否被 AI 引用、核心事实是否被吸收，写阶段报告",
        writes="`08_效果追踪/<轮次名>.md`",
        done="指标按统一口径并披露分母和独立探针数；每个结论都能追到回答编号；"
        "写明局限",
        subagent_type="geo-tracking",
    ),
)


def stage(key: str) -> Stage | None:
    return next((s for s in STAGES if s.key == key), None)


# Skills that only fit one brand (e.g. one carrying that brand's fact pack)
# are configured per Space: ``GEO/stage_skills.json`` maps a stage key to
# skill names, added after the stage's own.
SPACE_SKILLS_FILE = "stage_skills.json"


def stage_skills(stage: Stage, workspace_root: str | None) -> list[str]:
    skills = list(stage.skills)
    if not workspace_root:
        return skills
    path = (
        Path(workspace_root).expanduser()
        / store.GEO_ROOT_FOLDER
        / SPACE_SKILLS_FILE
    )
    extra = _read_json(path).get(stage.key) or []
    if isinstance(extra, list):
        skills += [x for x in extra if isinstance(x, str) and x not in skills]
    return skills


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
                "inputs": s.inputs,
                "duty": s.duty,
                "writes": s.writes,
                "done": s.done,
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


def _read_json(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        logger.warning("Unreadable JSON file: %s", path, exc_info=True)
        return {}
    return data if isinstance(data, dict) else {}


@lru_cache(maxsize=1)
def _builtin_profiles() -> dict:
    return _read_json(Path(__file__).with_name(_PROFILES_FILE))


def _user_profiles() -> dict:
    """Per-machine additions in ``~/.eigent/geo/model_profiles.json``, same
    shape as the built-in file; they win over it."""
    return _read_json(store.registry_path().parent / _PROFILES_FILE)


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
