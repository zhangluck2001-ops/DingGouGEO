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

import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GeoBase from '../GeoBase';
import { GeoPipelineView } from '../GeoPipeline';

/**
 * The whole GEO pipeline for this brand: where each stage stands against
 * its completion criteria, then the charts.
 */
export default function GeoOverview() {
  const { t } = useTranslation();
  return (
    <GeoBase
      sectionId="geo-overview"
      title={t('layout.geo-overview', { defaultValue: 'GEO overview' })}
      datasets={['answers']}
      views={['custom', 'dashboard']}
      dashboardKind="overview"
      customView={{
        icon: ListChecks,
        label: t('geo.view-pipeline', { defaultValue: 'Pipeline' }),
        render: ({ projectId, refreshKey }) => (
          <GeoPipelineView projectId={projectId} refreshKey={refreshKey} />
        ),
      }}
    />
  );
}
