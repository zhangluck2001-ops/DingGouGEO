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
"""Shared prompt blocks. The GEO Agent's own prompts live in
``app.geo.agent_prompt``."""

CONNECTED_APP_MCP_NOTICE = """\
<connected_app_tools>
When the user asks to query or operate a third-party app that may already be
connected, use available MCP or connector tools before browser/manual-login
flows. Examples include Clerk, Slack, Gmail, Notion, GitHub, Google Calendar,
Google Drive, Jira, Linear, Lark, Airtable, HubSpot, and similar SaaS apps.

- Search or list the app's available actions first.
- Execute read/list/search/count actions directly when the user's intent is
  clear and all required input is available or optional.
- Execute write/send/update/delete/admin actions only when the user explicitly
  asked for that change and the target details are clear.
- Ask for dashboard links, API keys, or manual browser login only after the
  connector tools show the app/account/action is unavailable or required input
  is missing.
</connected_app_tools>
"""


def append_connected_app_mcp_notice(system_message: str) -> str:
    return f"{system_message.rstrip()}\n\n{CONNECTED_APP_MCP_NOTICE}"


_TOOLCHAIN_PREFLIGHT_NOTICE = """
<toolchain_preflight>
- Before work requiring local executables or resuming numbered output files,
  use `terminal_preflight` when available. It inspects worker PATH and bounded
  file metadata without launching a process. A login shell's PATH or installed
  version does not prove availability in an already running Desktop worker.
- Discovery is not execution or access authorization. Require explicit user
  confirmation before downloading/installing dependencies, copying recovery
  files, changing PATH, or requesting a new filesystem root. Existing explicit
  confirmation can be reused for the action it covers. Do not auto-install,
  bypass a rejection, or add broad application/temporary roots to an allowlist.
- Use only runtime-supplied EIGENT_RUNTIME_DIR for toolchains, EIGENT_CACHE_DIR
  for caches and EIGENT_INTERMEDIATE_DIR for recoverable intermediate files
  when those locations are available and authorized. Do not invent alternate
  external paths when these variables are absent. Keep deliverables in the
  workspace. Runtime path configuration alone never grants filesystem access.
- For a workspace-only recovery handoff, use a real in-workspace directory,
  for example output/resume_frames. If the source is outside the workspace,
  explain that it was not inspected and ask for confirmation of a user-managed
  copy or a narrowly scoped authorization. Do not create an escaping symlink.
- Supply the expected filename pattern and inclusive number range to preflight.
  If the sequence is complete, verify provenance, render settings and contents
  using authorized tools, reuse the existing frames and continue only the
  remaining assembly step. Check gaps or invalid files before deciding what
  needs rendering; do not automatically re-render a complete sequence.
- This snapshot does not reconcile active writers or recover Git checkpoints.
  Use the existing runtime lifecycle before further writes. Preserve previous
  failures and unknown outcomes; metadata discovery does not mark a Task done.
</toolchain_preflight>
"""
