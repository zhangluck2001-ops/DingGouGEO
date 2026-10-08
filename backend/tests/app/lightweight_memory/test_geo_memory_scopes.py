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
"""DingGouGEO: a Space is the brand project, so explicit notes default there."""

import pytest

from app.lightweight_memory.maintainer import ConservativeMemoryExtractor
from app.lightweight_memory.service import HistoryQueryResult


def _message(text: str, index: int = 1) -> HistoryQueryResult:
    return HistoryQueryResult(
        citation_id=f"c{index}",
        journal_cursor=index,
        event_id=f"e{index}",
        run_id="run-1",
        event_type="user.message",
        content={"content": text},
        source_trust="user_asserted",
        created_at=0.0,
    )


def _scopes(text: str, default_scope: str = "space") -> dict[str, str]:
    extractor = ConservativeMemoryExtractor()
    found = {}
    for target in ("project", "space", "user"):
        for proposal in extractor.extract(
            active_memory=(),
            history_delta=(_message(text),),
            target_scope=target,
            default_scope=default_scope,
        ):
            found[target] = proposal.content
    return found


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("记住：发布版标题不超过30字", {"space": "发布版标题不超过30字"}),
        ("这个项目：统一用「SMA敏护」", {"space": "统一用「SMA敏护」"}),
        ("本次会话：先不管采集", {"project": "先不管采集"}),
        ("我偏好先给结论再给依据", {"user": "先给结论再给依据"}),
        ("记住，以后都用中文回复", {"user": "以后都用中文回复"}),
    ],
)
def test_explicit_notes_land_in_the_right_scope(text, expected):
    assert _scopes(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "这个空间里有哪些数据",
        "当前项目的探针有多少条",
        "我喜欢这个结果",
    ],
)
def test_ordinary_questions_are_not_stored(text):
    assert _scopes(text) == {}


def test_without_a_space_unmarked_notes_stay_with_the_conversation():
    assert _scopes("记住：区域是新加坡", default_scope="project") == {
        "project": "区域是新加坡"
    }
