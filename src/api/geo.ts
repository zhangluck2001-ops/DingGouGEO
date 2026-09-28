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

import { fetchGet, fetchPatch, fetchPost } from '@/api/http';

export interface GeoFacetValue {
  value: string;
  count: number;
}

export type GeoDatasetKey =
  'facts' | 'answers' | 'citations' | 'probes' | 'contents';

/** One row as returned by the local store; field values are text. */
export type GeoRecord = {
  id: number;
  local_edited?: number;
  updated_at?: string | null;
  citation_count?: number;
  cited_count?: number;
  citations?: GeoLinkedCitation[];
} & Record<string, string | number | null | undefined | GeoLinkedCitation[]>;

export interface GeoLinkedCitation {
  id: number;
  title: string | null;
  url: string | null;
  source_platform?: string | null;
  source_type?: string | null;
  ai_platform?: string | null;
  run_id?: string | null;
  probe_code?: string | null;
}

export interface GeoRecordPage {
  items: GeoRecord[];
  total: number;
  facets: Record<string, GeoFacetValue[]>;
}

export interface GeoProject {
  id: number;
  name: string;
  space_id: string | null;
  workspace_root: string | null;
  counts: Record<GeoDatasetKey, number>;
  last_imported_at: string | null;
}

export interface GeoChartRow {
  id?: number;
  label: string;
  value: number;
}

export interface GeoDashboard {
  totals: {
    facts: number;
    answers: number;
    citations: number;
    probes: number;
    contents: number;
    published: number;
    cited_contents: number;
    answers_with_sources: number;
  };
  charts: Record<string, GeoChartRow[]>;
}

export interface GeoImportRun {
  id: number;
  project: string | null;
  source: string;
  table_id: string | null;
  status: 'running' | 'done' | 'error';
  row_count: number;
  message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface GeoKnowledgeModule {
  key: string;
  path: string;
  exists: boolean;
  filled: boolean;
  products: string[];
  modified_at: string | null;
}

export type GeoKnowledgeSourceStatus = '待清洗' | '清洗中' | '已清洗';

export interface GeoKnowledgeSource {
  name: string;
  path: string;
  size: number;
  status: GeoKnowledgeSourceStatus;
  imported_at: string;
  cleaned_at: string | null;
}

export interface GeoKnowledgeStatus {
  project_id: number;
  root: string | null;
  rules_path?: string;
  raw_path?: string;
  modules: GeoKnowledgeModule[];
  sources: GeoKnowledgeSource[];
  fact_count?: number;
}

export type GeoQuery = Record<string, string | number | undefined>;

function clean(params: GeoQuery) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== ''
    )
  );
}

export const geoApi = {
  projects: (): Promise<{ items: GeoProject[] }> => fetchGet('/geo/projects'),
  ensureSpace: (body: {
    space_id: string;
    name: string;
    email: string | null;
    user_id: string | null;
  }): Promise<{
    project_id: number;
    name: string;
    created_project: boolean;
    created_paths: string[];
  }> => fetchPost('/geo/spaces/ensure', body),
  knowledge: (projectId: number): Promise<GeoKnowledgeStatus> =>
    fetchGet('/geo/knowledge', { project_id: projectId }),
  importKnowledgeSources: (
    projectId: number,
    paths: string[]
  ): Promise<{ imported: string[] }> =>
    fetchPost('/geo/knowledge/sources', { project_id: projectId, paths }),
  setKnowledgeSourceStatus: (
    projectId: number,
    fileName: string,
    status: GeoKnowledgeSourceStatus
  ): Promise<{ ok: boolean }> =>
    fetchPost('/geo/knowledge/sources/status', {
      project_id: projectId,
      file_name: fileName,
      status,
    }),
  dashboard: (projectId: number): Promise<GeoDashboard> =>
    fetchGet('/geo/dashboard', { project_id: projectId }),
  list: (dataset: GeoDatasetKey, params: GeoQuery): Promise<GeoRecordPage> =>
    fetchGet(`/geo/datasets/${dataset}`, clean(params)),
  get: (dataset: GeoDatasetKey, id: number): Promise<GeoRecord> =>
    fetchGet(`/geo/datasets/${dataset}/${id}`),
  create: (
    dataset: GeoDatasetKey,
    projectId: number,
    fields: Record<string, string | null>
  ): Promise<GeoRecord> =>
    fetchPost(`/geo/datasets/${dataset}`, { project_id: projectId, fields }),
  update: (
    dataset: GeoDatasetKey,
    id: number,
    fields: Record<string, string | null>
  ): Promise<GeoRecord> =>
    fetchPatch(`/geo/datasets/${dataset}/${id}`, { fields }),
  remove: (
    dataset: GeoDatasetKey,
    ids: number[]
  ): Promise<{ deleted: number }> =>
    fetchPost(`/geo/datasets/${dataset}/delete`, { ids }),
  importStatus: (): Promise<{ running: boolean; runs: GeoImportRun[] }> =>
    fetchGet('/geo/import'),
  startImport: (): Promise<{ started: boolean; running: boolean }> =>
    fetchPost('/geo/import', {}),
};
