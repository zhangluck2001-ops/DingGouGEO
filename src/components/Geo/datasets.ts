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

import type { GeoDatasetKey } from '@/api/geo';

export type GeoFieldType =
  'text' | 'longtext' | 'select' | 'url' | 'count' | 'code';

export interface GeoField {
  key: string;
  /** i18n key under `geo.` plus English fallback. */
  labelKey: string;
  defaultLabel: string;
  type: GeoFieldType;
  /** Initial column width in px; people can drag to resize. */
  width: number;
  /** Shown in the grid until someone hides it. */
  visible?: boolean;
  /** Read-only computed fields (counts) are not editable. */
  readOnly?: boolean;
  /** Facet key that supplies options for `select` fields and filters. */
  facet?: boolean;
}

export interface GeoDatasetConfig {
  key: GeoDatasetKey;
  labelKey: string;
  defaultLabel: string;
  /** Field used as the record title in panels, cards, and AI prompts. */
  titleField: string;
  fields: GeoField[];
  defaultSort: { field: string; order: 'asc' | 'desc' };
  /** Field the kanban view groups by, when the dataset offers one. */
  kanbanField?: string;
}

const f = (
  key: string,
  defaultLabel: string,
  type: GeoFieldType,
  width: number,
  extra: Partial<GeoField> = {}
): GeoField => ({
  key,
  labelKey: `geo.field-${key.replace(/_/g, '-')}`,
  defaultLabel,
  type,
  width,
  visible: true,
  ...extra,
});

export const GEO_DATASETS: Record<GeoDatasetKey, GeoDatasetConfig> = {
  facts: {
    key: 'facts',
    labelKey: 'geo.view-facts',
    defaultLabel: 'Knowledge entries',
    titleField: 'content',
    defaultSort: { field: 'id', order: 'desc' },
    fields: [
      f('module', 'Module', 'select', 120, { facet: true }),
      f('product', 'Product', 'select', 150, { facet: true }),
      f('field', 'Field', 'text', 130),
      f('content', 'Content', 'longtext', 320),
      f('claim_type', 'Type', 'select', 88, { facet: true }),
      f('evidence_grade', 'Evidence', 'select', 80, { facet: true }),
      f('source', 'Source', 'text', 180),
      f('note', 'Notes', 'longtext', 200, { visible: false }),
    ],
  },
  answers: {
    key: 'answers',
    labelKey: 'geo.view-answers',
    defaultLabel: 'Answers',
    titleField: 'probe_text',
    defaultSort: { field: 'capture_code', order: 'desc' },
    fields: [
      f('capture_code', 'Run', 'code', 124),
      f('probe_code', 'Probe', 'code', 72),
      f('probe_text', 'Question', 'longtext', 300),
      f('platform', 'AI platform', 'select', 132, { facet: true }),
      f('batch', 'Batch', 'select', 88, { facet: true }),
      f('round', 'Round', 'select', 80, { facet: true }),
      f('capture_date', 'Date', 'text', 104),
      f('web_search', 'Web search', 'select', 96, { facet: true }),
      f('citation_count', 'Sources', 'count', 80, { readOnly: true }),
      f('answer', 'Answer', 'longtext', 320, { visible: false }),
      f('account', 'Account', 'text', 140, { visible: false }),
      f('share_url', 'Share link', 'url', 200, { visible: false }),
      f('keywords', 'Search keywords', 'longtext', 220, { visible: false }),
      f('category_word', 'Category', 'text', 120, { visible: false }),
      f('brand_pointer', 'Brand pointer', 'text', 120, { visible: false }),
    ],
  },
  citations: {
    key: 'citations',
    labelKey: 'geo.view-citations',
    defaultLabel: 'Sources',
    titleField: 'title',
    defaultSort: { field: 'id', order: 'desc' },
    fields: [
      f('title', 'Source title', 'longtext', 300),
      f('url', 'URL', 'url', 220),
      f('source_platform', 'Source site', 'text', 140),
      f('source_type', 'Type', 'select', 96, { facet: true }),
      f('ai_platform', 'AI platform', 'select', 132, { facet: true }),
      f('run_id', 'Run', 'code', 124),
      f('probe_code', 'Probe', 'code', 72),
      f('batch', 'Batch', 'select', 88, { facet: true }),
      f('capture_date', 'Date', 'text', 104, { visible: false }),
    ],
  },
  probes: {
    key: 'probes',
    labelKey: 'geo.view-probes',
    defaultLabel: 'Probes',
    titleField: 'text',
    defaultSort: { field: 'code', order: 'asc' },
    fields: [
      f('code', 'Probe', 'code', 72),
      f('text', 'Question', 'longtext', 340),
      f('review_status', 'Review', 'select', 104, { facet: true }),
      f('cep', 'Entry point', 'select', 150, { facet: true }),
      f('direction', 'Direction', 'select', 110, { facet: true }),
      f('category_word', 'Category', 'select', 120, { facet: true }),
      f('brand_pointer', 'Brand pointer', 'text', 120, { visible: false }),
      f('framework', 'Framework', 'text', 120, { visible: false }),
      f('note', 'Notes', 'longtext', 240, { visible: false }),
    ],
  },
  contents: {
    key: 'contents',
    labelKey: 'geo.view-contents',
    defaultLabel: 'Content',
    titleField: 'title',
    defaultSort: { field: 'serial_num', order: 'desc' },
    kanbanField: 'status',
    fields: [
      f('serial', 'No.', 'code', 64),
      f('title', 'Title', 'longtext', 320),
      f('status', 'Status', 'select', 96, { facet: true }),
      f('account_platform', 'Channel', 'select', 120, { facet: true }),
      f('account_name', 'Account', 'select', 150, { facet: true }),
      f('cited_count', 'AI citations', 'count', 96, { readOnly: true }),
      f('url', 'URL', 'url', 240),
    ],
  },
};

export function fieldLabel(
  t: (key: string, options: { defaultValue: string }) => string,
  field: Pick<GeoField, 'labelKey' | 'defaultLabel'>
) {
  return t(field.labelKey, { defaultValue: field.defaultLabel });
}

export function recordTitle(
  config: GeoDatasetConfig,
  record: Record<string, unknown>
): string {
  const value = record[config.titleField] ?? record.url ?? record.id;
  return String(value ?? '—');
}
