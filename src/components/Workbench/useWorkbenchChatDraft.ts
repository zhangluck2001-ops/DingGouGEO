// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

import { useWorkbenchStore } from '@/store/workbenchStore';
import { useEffect, type Dispatch, type SetStateAction } from 'react';

/**
 * Appends text the workbench sent ("Ask AI" on selected rows) to a chat
 * composer draft. Whichever composer is mounted consumes it once.
 */
export function useWorkbenchChatDraft(
  setMessage: Dispatch<SetStateAction<string>>,
  onReceived?: () => void
) {
  const chatDraft = useWorkbenchStore((state) => state.chatDraft);
  const consumeChatDraft = useWorkbenchStore((state) => state.consumeChatDraft);

  useEffect(() => {
    if (!chatDraft) return;
    setMessage((current) => {
      const existing = current.trimEnd();
      return existing
        ? `${existing}\n\n${chatDraft.content}`
        : chatDraft.content;
    });
    consumeChatDraft(chatDraft.id);
    onReceived?.();
  }, [chatDraft, consumeChatDraft, onReceived, setMessage]);
}
