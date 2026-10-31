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

import { SessionActivityPanel } from '@/components/Session/SidePanel/components/ActivityPanel';
import { DsIcon } from '@/components/ui/ds-icon';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Run details (agents, context, environments, files) for the latest run,
 * folded at the end of its "worked for" log. DingGouGEO has no separate
 * summary column: the chat and the panel beside it are enough day to day, and
 * these details are for when something needs checking.
 */
export function RunDetails() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full min-w-0 flex-col" data-run-details>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1 border-0 border-x-0 border-y-0 bg-transparent px-0 py-1 text-left"
      >
        <span className="text-ds-text-meta font-medium text-ds-ink-muted-default">
          {t('chat.run-details', { defaultValue: 'Run details' })}
        </span>
        <DsIcon
          icon={open ? ChevronDown : ChevronRight}
          className="text-ds-ink-muted-default"
        />
      </button>
      {open ? (
        <div className="mt-1 flex min-h-0 flex-col overflow-hidden rounded-2xl bg-ds-neutral-default-default pl-2">
          <SessionActivityPanel scope="latest" />
        </div>
      ) : null}
    </div>
  );
}
