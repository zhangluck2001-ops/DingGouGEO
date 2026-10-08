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
  rounds: {
    key: 'rounds',
    labelKey: 'geo.view-rounds',
    defaultLabel: 'Capture rounds',
    titleField: 'name',
    defaultSort: { field: 'seq', order: 'asc' },
    fields: [
      f('seq', 'No.', 'code', 64),
      f('name', 'Name', 'text', 120),
      f('kind', 'Kind', 'select', 88, { facet: true }),
      f('status', 'Status', 'select', 96, { facet: true }),
      f('started_on', 'Started', 'text', 104),
      f('ended_on', 'Finished', 'text', 104),
      f('answer_count', 'Answers', 'count', 88, { readOnly: true }),
      f('citation_count', 'Sources', 'count', 88, { readOnly: true }),
      f('analysis_count', 'Analyses', 'count', 88, {
        readOnly: true,
        visible: false,
      }),
      f('probe_scope', 'Probe scope', 'longtext', 200),
      f('platforms', 'AI platforms', 'longtext', 180),
      f('note', 'Notes', 'longtext', 240),
    ],
  },
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
      f('role', 'Role', 'select', 104, { facet: true }),
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
      f('capture_round', 'Capture round', 'select', 96, { facet: true }),
      f('probe_group', 'Probe group', 'select', 88, { facet: true }),
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
  analyses: {
    key: 'analyses',
    labelKey: 'geo.view-analyses',
    defaultLabel: 'Answer analysis',
    titleField: 'probe_text',
    defaultSort: { field: 'capture_code', order: 'desc' },
    fields: [
      f('capture_code', 'Run', 'code', 124),
      f('probe_code', 'Probe', 'code', 72, { readOnly: true }),
      f('probe_text', 'Question', 'longtext', 260, { readOnly: true }),
      f('platform', 'AI platform', 'text', 132, { readOnly: true }),
      f('capture_round', 'Capture round', 'select', 96, { facet: true }),
      f('mentions_own', 'Mentions own brand', 'select', 104, { facet: true }),
      f('recommend_own', 'Recommends own brand', 'select', 112, {
        facet: true,
      }),
      f('own_in_top3', 'Own brand in top 3', 'select', 96, { facet: true }),
      f('top_brand', 'Top pick', 'text', 130),
      f('mentioned_brands', 'Brands mentioned', 'longtext', 220),
      f('brand_count', 'Brand count', 'text', 88, { visible: false }),
      f('competitor_relation', 'Competitor relation', 'select', 150, {
        facet: true,
      }),
      f('sentiment', 'Sentiment', 'select', 96, { facet: true }),
      f('recommend_reason', 'Recommendation reason', 'longtext', 240, {
        visible: false,
      }),
      f('reason_selling_points', 'Selling points hit', 'longtext', 220, {
        visible: false,
      }),
      f('not_recommend_reason', 'Why not recommended', 'longtext', 240, {
        visible: false,
      }),
      f('risk_tags', 'Risk reminders', 'longtext', 200, { visible: false }),
      f('own_rank', 'Own brand rank', 'text', 88, { visible: false }),
      f('anchor_same_para', 'Evidence anchor alongside', 'select', 120, {
        facet: true,
        visible: false,
      }),
      f('absorbed_facts', 'Core facts repeated', 'longtext', 200, {
        visible: false,
      }),
      f('concerns', 'Concerns', 'longtext', 180, { visible: false }),
    ],
  },
  gaps: {
    key: 'gaps',
    labelKey: 'geo.view-gaps',
    defaultLabel: 'Gaps',
    titleField: 'scene',
    defaultSort: { field: 'id', order: 'desc' },
    kanbanField: 'status',
    fields: [
      f('scene', 'Scene', 'longtext', 220),
      f('gap_type', 'Gap type', 'select', 112, { facet: true }),
      f('priority', 'Priority', 'select', 80, { facet: true }),
      f('status', 'Status', 'select', 96, { facet: true }),
      f('capture_round', 'Capture round', 'select', 96, { facet: true }),
      f('platforms', 'AI platforms', 'longtext', 160),
      f('direction', 'Content direction', 'longtext', 260, {
        labelKey: 'geo.field-gap-direction',
      }),
      f('evidence', 'Evidence answers', 'longtext', 200),
      f('note', 'Notes', 'longtext', 200, { visible: false }),
    ],
  },
  benchmarks: {
    key: 'benchmarks',
    labelKey: 'geo.view-benchmarks',
    defaultLabel: 'Benchmark articles',
    titleField: 'title',
    defaultSort: { field: 'id', order: 'desc' },
    fields: [
      f('title', 'Title', 'longtext', 280),
      f('site', 'Site', 'select', 140, { facet: true }),
      f('cited_count', 'Times cited', 'text', 88, {
        labelKey: 'geo.field-times-cited',
      }),
      f('ai_platforms', 'Cited by', 'longtext', 160),
      f('chars', 'Length', 'text', 80),
      f('brand_count', 'Brand count', 'text', 88),
      f('structure', 'Structure', 'longtext', 280),
      f('url', 'URL', 'url', 220),
      f('archive_path', 'Saved copy', 'text', 200, { visible: false }),
      f('capture_round', 'Capture round', 'select', 96, { facet: true }),
      f('note', 'Notes', 'longtext', 200, { visible: false }),
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
      f('domain', 'Domain', 'text', 150, { visible: false }),
      f('source_type', 'Type', 'select', 96, { facet: true }),
      f('ai_platform', 'AI platform', 'select', 132, { facet: true }),
      f('run_id', 'Run', 'code', 124),
      f('probe_code', 'Probe', 'code', 72),
      f('capture_round', 'Capture round', 'select', 96, { facet: true }),
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
      f('brand_pointer', 'Brand pointer', 'select', 120, { facet: true }),
      f('framework', 'Framework', 'select', 104, { facet: true }),
      f('selling_points', 'Selling points', 'longtext', 220, {
        visible: false,
      }),
      f('panel', 'Panel', 'select', 104, { facet: true, visible: false }),
      f('basis', 'Real questions behind it', 'longtext', 200, {
        visible: false,
      }),
      f('no_go', 'NO_GO', 'select', 80, { facet: true, visible: false }),
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
      f('channel', 'Channel type', 'select', 96, { facet: true }),
      f('account_platform', 'Channel', 'select', 120, { facet: true }),
      f('account_name', 'Account', 'select', 150, { facet: true }),
      f('cited_count', 'AI citations', 'count', 96, { readOnly: true }),
      f('url', 'URL', 'url', 240),
      f('batch', 'Batch', 'select', 120, { facet: true }),
      f('qc_status', 'Gate check', 'select', 96, { facet: true }),
      f('published_on', 'Published on', 'text', 104),
      f('based_on_round', 'Based on round', 'select', 104, {
        facet: true,
        visible: false,
      }),
      f('gap_ids', 'Gaps answered', 'text', 120, { visible: false }),
      f('target_channel', 'Target channel', 'text', 160, { visible: false }),
      f('benchmark_url', 'Modelled on', 'url', 200, { visible: false }),
      f('body_path', 'Text file', 'text', 220, { visible: false }),
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
