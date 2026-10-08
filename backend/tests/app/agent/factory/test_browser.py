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


import pytest

from app.agent.factory.browser import CdpBrowserPoolManager

pytestmark = pytest.mark.unit


def test_electron_browser_pool_allocates_by_target_not_shared_port():
    pool = CdpBrowserPoolManager()
    browsers = [
        {
            "port": 9222,
            "managedBy": "electron",
            "targetUrl": "about:blank#eigent-browser-toolkit=1",
        },
        {
            "port": 9222,
            "managedBy": "electron",
            "targetUrl": "about:blank#eigent-browser-toolkit=2",
        },
    ]

    first = pool.acquire_browser(browsers, "session-1", "task-1")
    second = pool.acquire_browser(browsers, "session-2", "task-1")

    assert first == browsers[0]
    assert second == browsers[1]
    assert pool.acquire_browser(browsers, "session-3", "task-1") is None

    pool.release_browser(9222, "session-1")
    assert pool.acquire_browser(browsers, "session-3", "task-1") == browsers[0]
