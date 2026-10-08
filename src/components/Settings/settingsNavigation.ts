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

import type { SettingsScope, SettingsSectionId } from '@/store/settingsStore';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Bot,
  Brain,
  Cable,
  Cookie,
  Globe,
  LayoutDashboard,
  Link2,
  MessageCircleQuestion,
  PenLine,
  Puzzle,
  ScanSearch,
  Send,
  Settings,
  Sparkles,
  Stethoscope,
  WandSparkles,
} from 'lucide-react';

export interface SettingsNavigationItem {
  id: SettingsSectionId;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
}

export interface SettingsNavigationGroup {
  scope: SettingsScope;
  labelKey: string;
  defaultLabel: string;
  items: SettingsNavigationItem[];
}

export const SETTINGS_NAVIGATION: SettingsNavigationGroup[] = [
  {
    scope: 'settings',
    labelKey: 'layout.settings',
    defaultLabel: 'Settings',
    items: [
      {
        id: 'settings',
        labelKey: 'setting.general',
        defaultLabel: 'General',
        icon: Settings,
      },
      {
        id: 'models',
        labelKey: 'setting.models',
        defaultLabel: 'Models',
        icon: Sparkles,
      },
      {
        id: 'sub-agents',
        labelKey: 'setting.sub-agents',
        defaultLabel: 'GEO agents',
        icon: Bot,
      },
      {
        id: 'skills',
        labelKey: 'agents.skills',
        defaultLabel: 'Skills',
        icon: WandSparkles,
      },
      {
        id: 'connectors',
        labelKey: 'layout.connectors',
        defaultLabel: 'Connectors',
        icon: Cable,
      },
      {
        id: 'memory',
        labelKey: 'agents.memory',
        defaultLabel: 'Memory',
        icon: Brain,
      },
    ],
  },
  {
    scope: 'device',
    labelKey: 'layout.device',
    defaultLabel: 'Device',
    items: [
      {
        id: 'browser-connections',
        labelKey: 'layout.browser',
        defaultLabel: 'Browser',
        icon: Globe,
      },
      {
        id: 'browser-plugins',
        labelKey: 'layout.browser-extension',
        defaultLabel: 'Extension',
        icon: Puzzle,
      },
      {
        id: 'cookies',
        labelKey: 'layout.browser-cookie',
        defaultLabel: 'Cookies',
        icon: Cookie,
      },
    ],
  },
];

/**
 * The GEO pipeline, in order. Lives in the Workspace sidebar and opens in
 * the GEO panel beside the chat — not in Settings.
 */
export const GEO_NAVIGATION: SettingsNavigationItem[] = [
  {
    id: 'geo-overview',
    labelKey: 'layout.geo-overview',
    defaultLabel: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'geo-knowledge',
    labelKey: 'layout.geo-knowledge',
    defaultLabel: 'Brand knowledge base',
    icon: BookOpen,
  },
  {
    id: 'geo-probes',
    labelKey: 'layout.geo-probes',
    defaultLabel: 'Intent probes',
    icon: MessageCircleQuestion,
  },
  {
    id: 'geo-answers',
    labelKey: 'layout.geo-answers',
    defaultLabel: 'AI capture',
    icon: ScanSearch,
  },
  {
    id: 'geo-analysis',
    labelKey: 'layout.geo-analysis',
    defaultLabel: 'Diagnosis',
    icon: Stethoscope,
  },
  {
    id: 'geo-citations',
    labelKey: 'layout.geo-citations',
    defaultLabel: 'Cited sources',
    icon: Link2,
  },
  {
    id: 'geo-drafts',
    labelKey: 'layout.geo-drafts',
    defaultLabel: 'Content production',
    icon: PenLine,
  },
  {
    id: 'geo-published',
    labelKey: 'layout.geo-published',
    defaultLabel: 'Publishing and tracking',
    icon: Send,
  },
];

export function isGeoSection(section: SettingsSectionId) {
  return GEO_NAVIGATION.some((item) => item.id === section);
}

/**
 * Sections DingGouGEO no longer shows. Their ids stay valid for old links and
 * stored state, which fall back to a visible section instead.
 */
const RETIRED_SETTINGS_SECTIONS: Partial<
  Record<SettingsSectionId, SettingsSectionId | null>
> = {
  channels: null,
  'geo-data': 'geo-answers',
  'geo-content': 'geo-drafts',
};

export function visibleSettingsSection(
  section: SettingsSectionId,
  fallback: SettingsSectionId
): SettingsSectionId {
  if (!(section in RETIRED_SETTINGS_SECTIONS)) return section;
  return RETIRED_SETTINGS_SECTIONS[section] ?? fallback;
}

export function getSettingsNavigationItem(section: SettingsSectionId) {
  const geoItem = GEO_NAVIGATION.find((item) => item.id === section);
  if (geoItem) return geoItem;
  for (const group of SETTINGS_NAVIGATION) {
    const item = group.items.find((candidate) => candidate.id === section);
    if (item) return item;
  }
  return SETTINGS_NAVIGATION[0].items[0];
}
