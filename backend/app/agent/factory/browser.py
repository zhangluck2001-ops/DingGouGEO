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

import threading

from app.agent.listen_chat_agent import logger

# TODO: Remove NoteTakingToolkit and use TerminalToolkit instead
from app.component.environment import env
from app.utils.browser_launcher import normalize_cdp_url


def _get_browser_port(browser: dict) -> int:
    """Extract port from a browser config dict, with fallback to env default."""
    raw_port = browser.get("port")
    if raw_port is not None:
        return int(raw_port)

    raw_endpoint = browser.get("endpoint") or browser.get("cdp_url")
    if raw_endpoint:
        _, _, port = normalize_cdp_url(str(raw_endpoint))
        return port

    return int(env("browser_port", "9222"))


def _get_browser_endpoint(browser: dict) -> str:
    """Extract a normalized CDP endpoint from a browser config dict."""
    raw_endpoint = browser.get("endpoint") or browser.get("cdp_url")
    if raw_endpoint:
        endpoint, _, _ = normalize_cdp_url(str(raw_endpoint))
        return endpoint

    return f"http://localhost:{_get_browser_port(browser)}"


class CdpBrowserPoolManager:
    """Manages CDP browser pool occupation to ensure
    parallel tasks use different browsers."""

    def __init__(self):
        self._occupied_browsers: dict[str, str] = {}
        self._session_to_browser_key: dict[str, str] = {}
        self._session_to_port: dict[str, int] = {}
        self._session_to_task: dict[str, str | None] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _browser_key(browser: dict) -> str | None:
        target_url = str(browser.get("targetUrl") or "").strip()
        if target_url:
            return f"target:{target_url}"
        try:
            return f"port:{_get_browser_port(browser)}"
        except (TypeError, ValueError):
            return None

    def acquire_browser(
        self,
        cdp_browsers: list[dict],
        session_id: str,
        task_id: str | None = None,
    ) -> dict | None:
        """Acquire an available browser from the pool.

        Args:
            cdp_browsers: List of browser configurations.
            session_id: Unique session identifier.
            task_id: Optional task identifier for ownership tracking.

        Returns:
            Browser configuration dict or None if all occupied.
        """
        with self._lock:
            for browser in cdp_browsers:
                try:
                    port = _get_browser_port(browser)
                except (TypeError, ValueError):
                    continue
                browser_key = self._browser_key(browser)
                if browser_key and browser_key not in self._occupied_browsers:
                    self._occupied_browsers[browser_key] = session_id
                    self._session_to_browser_key[session_id] = browser_key
                    self._session_to_port[session_id] = port
                    self._session_to_task[session_id] = task_id
                    logger.info(
                        f"Acquired browser on port {port} for session "
                        f"{session_id}. Occupied: "
                        f"{list(self._occupied_browsers.keys())}"
                    )
                    return browser
            logger.warning(
                f"No available browsers for session {session_id}. "
                f"All occupied: {list(self._occupied_browsers.keys())}"
            )
            return None

    def release_browser(self, port: int, session_id: str):
        """Release a browser back to the pool."""
        with self._lock:
            browser_key = self._session_to_browser_key.get(session_id)
            if (
                browser_key is not None
                and self._occupied_browsers.get(browser_key) == session_id
            ):
                del self._occupied_browsers[browser_key]
                self._session_to_browser_key.pop(session_id, None)
                self._session_to_port.pop(session_id, None)
                self._session_to_task.pop(session_id, None)
                logger.info(
                    f"Released browser on port {port} from session "
                    f"{session_id}. Occupied: "
                    f"{list(self._occupied_browsers.keys())}"
                )
            else:
                logger.warning(
                    f"Attempted to release browser on port {port} "
                    f"but it was not occupied by {session_id}"
                )

    def release_by_task(self, task_id: str) -> list[int]:
        """Release all browsers associated with a task_id.

        Returns:
            List of released ports.
        """
        released_ports = []
        with self._lock:
            sessions = [
                s for s, t in self._session_to_task.items() if t == task_id
            ]
            for session_id in sessions:
                port = self._session_to_port.get(session_id)
                browser_key = self._session_to_browser_key.get(session_id)
                if (
                    browser_key is not None
                    and self._occupied_browsers.get(browser_key) == session_id
                ):
                    del self._occupied_browsers[browser_key]
                    self._session_to_browser_key.pop(session_id, None)
                if port is not None:
                    released_ports.append(port)
                self._session_to_port.pop(session_id, None)
                self._session_to_task.pop(session_id, None)
            if released_ports:
                logger.info(
                    f"Released {len(released_ports)} browser(s) for "
                    f"task {task_id}. Occupied: "
                    f"{list(self._occupied_browsers.keys())}"
                )
        return released_ports

    def get_occupied_ports(self) -> list[int]:
        """Get list of currently occupied ports."""
        with self._lock:
            return list(dict.fromkeys(self._session_to_port.values()))


# Global CDP browser pool manager instance
_cdp_pool_manager = CdpBrowserPoolManager()
