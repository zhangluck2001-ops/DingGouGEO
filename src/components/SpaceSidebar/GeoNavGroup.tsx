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

import { NavTab, SidebarNavGroup } from '@/components/Layout/AppSidebar';
import { GEO_NAVIGATION } from '@/components/Settings/settingsNavigation';
import { useWorkbenchStore } from '@/store/workbenchStore';
import { useTranslation } from 'react-i18next';
import { SidebarAccordionSection } from './SidebarAccordionSection';

/**
 * GEO pipeline stages in the Workspace sidebar. Each opens in the GEO panel
 * beside the chat, the way Claude opens an artifact next to a conversation.
 */
export function GeoNavGroup() {
  const { t } = useTranslation();
  const open = useWorkbenchStore((state) => state.open);
  const section = useWorkbenchStore((state) => state.section);
  const openSection = useWorkbenchStore((state) => state.openSection);
  const setOpen = useWorkbenchStore((state) => state.setOpen);

  return (
    <SidebarAccordionSection
      label={t('layout.geo-pipeline', { defaultValue: 'GEO pipeline' })}
      defaultExpanded
    >
      <SidebarNavGroup>
        {GEO_NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = open && section === item.id;
          const label = t(item.labelKey, { defaultValue: item.defaultLabel });
          return (
            <NavTab
              key={item.id}
              active={active}
              onClick={() => (active ? setOpen(false) : openSection(item.id))}
              leading={<Icon className="h-4 w-4 shrink-0" aria-hidden />}
              label={label}
              ariaLabel={label}
              ariaCurrentPage={active}
            />
          );
        })}
      </SidebarNavGroup>
    </SidebarAccordionSection>
  );
}
