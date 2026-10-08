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

import { useTranslation } from 'react-i18next';
import GeoBase from '../GeoBase';

/**
 * Diagnosis: how each captured answer treats the brand (mentioned, top pick,
 * top 3, reasons, sentiment, risks), read per capture round.
 */
export default function GeoAnalysis() {
  const { t } = useTranslation();
  return (
    <GeoBase
      sectionId="geo-analysis"
      title={t('layout.geo-analysis', { defaultValue: 'Diagnosis' })}
      datasets={['analyses', 'gaps']}
      views={['grid', 'dashboard']}
      dashboardKind="analysis"
      agentTask={{
        label: t('geo.agent-task', { defaultValue: 'Hand to AI' }),
        prompt: ({ project, db, geoRoot, round }) =>
          t('geo.agent-prompt-analysis', {
            defaultValue:
              'Diagnose the captured answers of {{project}} in {{round}}. Database: {{db}}. For every answer in geo_answer that has no row in geo_answer_analysis yet (join on capture_code and capture_round), read the full answer and fill: mentions_own, mentioned_brands, brand_count, top_brand, own_in_top3, recommend_own, recommend_reason, reason_selling_points, not_recommend_reason, competitor_relation, sentiment, risk_tags. Use the brand facts in {{geo}}/01_品牌知识库 to recognise the brand and its selling points. Then write a short diagnosis of this round (where the brand is missing, which competitors lead and why) to {{geo}}/04_诊断分析/.',
            project,
            db,
            geo: geoRoot,
            round:
              round ??
              t('geo.latest-round', {
                defaultValue: 'the latest capture round',
              }),
          }),
      }}
    />
  );
}
