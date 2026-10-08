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

import useAppVersion from '@/hooks/use-app-version';
import { TagIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Appearance from '../Appearance';
import General from '../General';
import { SettingsRow, SettingsRowGroup } from '../SettingsRowGroup';
import SettingsSectionPage from '../SettingsSectionPage';
import GeoImportSettings from './GeoImportSettings';

/**
 * App version only. DingGouGEO ships without the upstream updater and
 * website links, so there is nothing to download or visit here.
 */
export function AboutSettings() {
  const { t } = useTranslation();
  const version = useAppVersion();

  return (
    <SettingsSectionPage>
      <SettingsRowGroup>
        <SettingsRow
          title={t('setting.version', { defaultValue: 'Version' })}
          description="DingGouGEO"
          action={
            <span className="flex items-center gap-2 text-ds-text-base text-ds-ink-default-default">
              <TagIcon
                className="h-4 w-4 text-ds-text-success-default-default"
                aria-hidden
              />
              {version || '—'}
            </span>
          }
        />
      </SettingsRowGroup>
    </SettingsSectionPage>
  );
}

export default function SettingsOverview() {
  return (
    <div className="flex w-full flex-col gap-4 py-4 [&>section]:py-0">
      <General />
      <Appearance />
      <GeoImportSettings />
      <AboutSettings />
    </div>
  );
}
