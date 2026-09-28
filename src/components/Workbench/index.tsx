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

import { SettingsHeader, SettingsHeaderProvider } from '@/components/Settings';
import SettingsSectionContent, {
  getSettingsSectionLayout,
  settingsSectionOwnsHeader,
} from '@/components/Settings/SettingsSectionContent';
import {
  getSettingsNavigationItem,
  isGeoSection,
  visibleSettingsSection,
} from '@/components/Settings/settingsNavigation';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/store/workbenchStore';
import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';

/** Lets pages inside the GEO panel render its close button in their toolbar. */
const WorkbenchChromeContext = createContext<{ onClose: () => void } | null>(
  null
);

export function useWorkbenchChrome() {
  return useContext(WorkbenchChromeContext);
}

/**
 * The GEO panel beside the chat. It only shows GEO pipeline stages; model,
 * skill, and device settings live in Settings.
 */
export default function Workbench({ className }: { className?: string }) {
  const { t } = useTranslation();
  const stored = visibleSettingsSection(
    useWorkbenchStore((state) => state.section),
    'geo-overview'
  );
  const section = isGeoSection(stored) ? stored : 'geo-overview';
  const setOpen = useWorkbenchStore((state) => state.setOpen);
  const item = getSettingsNavigationItem(section);

  return (
    <WorkbenchChromeContext.Provider value={{ onClose: () => setOpen(false) }}>
      <section
        aria-label={t(item.labelKey, { defaultValue: item.defaultLabel })}
        className={cn(
          'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-ds-neutral-subtle-default',
          className
        )}
      >
        <SettingsHeaderProvider activeSection={section}>
          {!settingsSectionOwnsHeader(section) && (
            <SettingsHeader activeSection={section} />
          )}
          <SettingsSectionContent
            activeSection={section}
            layout={getSettingsSectionLayout(section)}
          />
        </SettingsHeaderProvider>
      </section>
    </WorkbenchChromeContext.Provider>
  );
}
