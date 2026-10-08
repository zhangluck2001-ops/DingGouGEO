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

import { GeoSyncButton, useGeoProject } from '@/components/Geo/shared';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsRowGroup } from '../SettingsRowGroup';
import SettingsSectionPage from '../SettingsSectionPage';

/**
 * Feishu is an optional import, not a pipeline step: it pulls history from a
 * Feishu Base (configured in the Space's GEO/feishu_sources.json) into the
 * current Space's own database.
 */
export default function GeoImportSettings() {
  const { t } = useTranslation();
  const { project } = useGeoProject();
  if (!project) return null;
  return (
    <SettingsSectionPage>
      <SettingsRowGroup>
        <SettingsRow
          title={t('geo.import-feishu-title', {
            defaultValue: 'Import from Feishu (optional)',
          })}
          description={t('geo.import-feishu-desc', {
            defaultValue:
              'Copy history from a Feishu Base into the {{space}} Space. Configure the Base in GEO/feishu_sources.json inside the Space folder.',
            space: project.name,
          })}
          action={
            <GeoSyncButton
              projectId={project.id}
              onFinished={() => undefined}
            />
          }
        />
      </SettingsRowGroup>
    </SettingsSectionPage>
  );
}
