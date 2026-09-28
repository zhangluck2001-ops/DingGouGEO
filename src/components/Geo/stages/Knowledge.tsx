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

import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GeoBase from '../GeoBase';
import KnowledgeMaterials from '../KnowledgeMaterials';

/**
 * Stage 1: the brand knowledge base — raw materials, the seven cleaned
 * modules, and the ledger of graded facts every later stage relies on.
 */
export default function GeoKnowledge() {
  const { t } = useTranslation();
  return (
    <GeoBase
      sectionId="geo-knowledge"
      title={t('layout.geo-knowledge', {
        defaultValue: 'Brand knowledge base',
      })}
      datasets={['facts']}
      views={['custom', 'grid']}
      customView={{
        icon: BookOpen,
        label: t('geo.view-materials', {
          defaultValue: 'Materials and modules',
        }),
        render: ({ projectId, openGrid }) => (
          <KnowledgeMaterials projectId={projectId} openGrid={openGrid} />
        ),
      }}
    />
  );
}
