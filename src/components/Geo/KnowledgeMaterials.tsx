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

import {
  geoApi,
  type GeoKnowledgeSource,
  type GeoKnowledgeSourceStatus,
  type GeoKnowledgeStatus,
} from '@/api/geo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHost } from '@/host';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/store/workbenchStore';
import {
  BookOpen,
  FileText,
  FolderOpen,
  LoaderCircle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GeoEmptyState } from './shared';

const SOURCE_STATUSES: GeoKnowledgeSourceStatus[] = [
  '待清洗',
  '清洗中',
  '已清洗',
];
const SOURCE_FILE_FILTERS = [
  {
    name: 'Documents',
    extensions: [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'csv',
      'ppt',
      'pptx',
      'md',
      'txt',
    ],
  },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
];
const EVIDENCE_GRADES: [string, string, string][] = [
  ['A', 'geo.grade-a', 'Regulations, standards, guidelines'],
  ['B', 'geo.grade-b', 'Labels, registrations, test reports'],
  ['C', 'geo.grade-c', 'Brand claims — write as “the brand says”'],
  ['D', 'geo.grade-d', 'Third-party research and reviews'],
  ['E', 'geo.grade-e', 'Social posts — question ideas only, never facts'],
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-ds-12 rounded-ds-card border border-x border-y border-solid border-ds-hairline-default-default p-ds-16">
      <div className="flex flex-wrap items-start justify-between gap-ds-8">
        <div className="flex min-w-0 flex-col gap-ds-2">
          <DsText as="h2" role="base" weight="semibold">
            {title}
          </DsText>
          {description ? (
            <DsText as="p" role="meta" className="text-ds-ink-muted-default">
              {description}
            </DsText>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-ds-8">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Knowledge-base stage: raw brand materials in, cleaned modules out. The
 * cleaning itself is done by the AI in the chat, following 清洗规则.md.
 */
export default function KnowledgeMaterials({
  projectId,
  openGrid,
}: {
  projectId: number;
  openGrid: () => void;
}) {
  const { t } = useTranslation();
  const electronAPI = useHost()?.electronAPI;
  const sendToChat = useWorkbenchStore((state) => state.sendToChat);
  const [state, setState] = useState<GeoKnowledgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void geoApi
      .knowledge(projectId)
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(load, [load]);

  const openPath = (path: string, reveal = false) => {
    const action = reveal
      ? electronAPI?.revealLocalPath
      : electronAPI?.openLocalFile;
    if (!action) return;
    void Promise.resolve(action(path)).catch(() =>
      toast.error(
        t('geo.open-failed', {
          defaultValue: "Couldn't open it. Try the Files tab.",
        })
      )
    );
  };

  const upload = async () => {
    if (!electronAPI?.selectFile) return;
    const result = await electronAPI.selectFile({
      properties: ['openFile', 'multiSelections'],
      filters: SOURCE_FILE_FILTERS,
    });
    const paths: string[] = (result?.files ?? []).map(
      (file: { filePath: string }) => file.filePath
    );
    if (!result?.success || paths.length === 0) return;
    setImporting(true);
    try {
      const { imported } = await geoApi.importKnowledgeSources(
        projectId,
        paths
      );
      toast.success(
        t('geo.sources-imported', {
          defaultValue: '{{count}} files added',
          count: imported.length,
        })
      );
      load();
    } catch {
      toast.error(
        t('geo.sources-import-failed', {
          defaultValue: "Couldn't add the files. Try again.",
        })
      );
    } finally {
      setImporting(false);
    }
  };

  const setStatus = async (
    source: GeoKnowledgeSource,
    status: GeoKnowledgeSourceStatus
  ) => {
    try {
      await geoApi.setKnowledgeSourceStatus(projectId, source.name, status);
      load();
    } catch {
      toast.error(
        t('geo.record-save-failed', {
          defaultValue: "Couldn't save. Try again.",
        })
      );
    }
  };

  const askAiToClean = async (sources: GeoKnowledgeSource[]) => {
    if (!state?.root || sources.length === 0) return;
    sendToChat(
      t('geo.ai-prompt-clean', {
        defaultValue:
          'Clean these brand materials into the knowledge base, following {{rules}}:\n{{files}}\nRules: keep the originals in 原始资料 untouched; write each fact atomically into the matching module file under {{root}} (products go to 02_产品库/[SKU].md); tag every entry as 事实/宣称/话术 with evidence grade A–E and the source page; mark conflicts as 存疑. Also insert every entry into table geo_fact (project_id {{project}}) in {{db}}, then set the file’s status to 已清洗 in table geo_kb_source.',
        rules: state.rules_path,
        root: state.root,
        project: projectId,
        db: state.db_path ?? 'GEO/geo.db',
        files: sources.map((source) => `- ${source.path}`).join('\n'),
      })
    );
    await Promise.all(
      sources
        .filter((source) => source.status === '待清洗')
        .map((source) =>
          geoApi.setKnowledgeSourceStatus(projectId, source.name, '清洗中')
        )
    ).catch(() => undefined);
    toast.success(
      t('geo.sent-to-chat', { defaultValue: 'Added to the chat box' })
    );
    load();
  };

  if (loading && !state) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-ds-ink-muted-default"
          aria-hidden
        />
      </div>
    );
  }
  if (!state?.root) {
    return (
      <GeoEmptyState
        icon={BookOpen}
        title={t('geo.kb-no-folder-title', {
          defaultValue: 'This brand has no Space folder yet',
        })}
        description={t('geo.kb-no-folder-desc', {
          defaultValue:
            'Open this brand’s Space once so its GEO folders, including the knowledge base, are created.',
        })}
      />
    );
  }

  const pending = state.sources.filter((source) => source.status !== '已清洗');
  const filledCount = state.modules.filter((module) => module.filled).length;

  return (
    <div className="scrollbar-always-visible @container flex min-h-0 flex-1 flex-col gap-ds-12 overflow-y-auto p-ds-16">
      <Section
        title={t('geo.kb-rules-title', { defaultValue: 'Cleaning rules' })}
        description={t('geo.kb-rules-desc', {
          defaultValue:
            'One fact per entry, always with a source, facts kept apart from claims and sales talk, compliance checked. Nothing goes into content unless it’s in the knowledge base.',
        })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            buttonRadius="full"
            onClick={() => state.rules_path && openPath(state.rules_path)}
          >
            <FileText aria-hidden />
            {t('geo.kb-open-rules', { defaultValue: 'Open full rules' })}
          </Button>
        }
      >
        <ul className="m-0 grid list-none grid-cols-1 gap-ds-6 p-0 @xl:grid-cols-2">
          {EVIDENCE_GRADES.map(([grade, key, fallback]) => (
            <li key={grade} className="flex min-w-0 items-center gap-ds-8">
              <Badge variant="secondary" size="xs" className="shrink-0">
                {grade}
              </Badge>
              <DsText
                as="span"
                role="meta"
                className="min-w-0 text-ds-ink-default-default"
              >
                {t(key, { defaultValue: fallback })}
              </DsText>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={t('geo.kb-sources-title', { defaultValue: 'Raw materials' })}
        description={t('geo.kb-sources-desc', {
          defaultValue:
            'PDF, Word, Excel, and images from the brand. Copies are kept unchanged in 原始资料 as the source of truth.',
        })}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              buttonRadius="full"
              onClick={() => state.raw_path && openPath(state.raw_path, true)}
            >
              <FolderOpen aria-hidden />
              {t('geo.open-folder', { defaultValue: 'Open folder' })}
            </Button>
            {pending.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                buttonRadius="full"
                onClick={() => void askAiToClean(pending)}
              >
                <Sparkles aria-hidden />
                {t('geo.kb-clean-all', {
                  defaultValue: 'Clean {{count}} with AI',
                  count: pending.length,
                })}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              buttonRadius="full"
              disabled={importing || !electronAPI?.selectFile}
              onClick={() => void upload()}
            >
              {importing ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Upload aria-hidden />
              )}
              {t('geo.kb-upload', { defaultValue: 'Add materials' })}
            </Button>
          </>
        }
      >
        {state.sources.length === 0 ? (
          <DsText as="p" role="meta" className="text-ds-ink-muted-default">
            {t('geo.kb-sources-empty', {
              defaultValue:
                'No materials yet. Add the brand’s manuals, labels, reports, or FAQs to start.',
            })}
          </DsText>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {state.sources.map((source) => (
              <li
                key={source.name}
                className="flex min-w-0 flex-wrap items-center gap-ds-8 border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default py-ds-8 last:border-x-0 last:border-t-0 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => openPath(source.path)}
                  className="flex min-w-0 flex-1 items-center gap-ds-8 text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ds-ring-focus"
                  title={source.path}
                >
                  <FileText
                    className="h-4 w-4 shrink-0 text-ds-ink-muted-default"
                    aria-hidden
                  />
                  <DsText as="span" role="base" className="truncate">
                    {source.name}
                  </DsText>
                </button>
                <DsText
                  as="span"
                  role="meta"
                  className="shrink-0 text-ds-ink-muted-default tabular-nums"
                >
                  {formatSize(source.size)}
                </DsText>
                <Select
                  value={source.status}
                  onValueChange={(value) =>
                    void setStatus(source, value as GeoKnowledgeSourceStatus)
                  }
                >
                  <SelectTrigger
                    size="xs"
                    aria-label={t('geo.kb-source-status', {
                      defaultValue: 'Cleaning status',
                    })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="xs"
                  buttonContent="icon-only"
                  onClick={() => void askAiToClean([source])}
                  aria-label={t('geo.kb-clean-one', {
                    defaultValue: 'Clean {{name}} with AI',
                    name: source.name,
                  })}
                >
                  <Sparkles aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('geo.kb-modules-title', {
          defaultValue: 'Knowledge base modules',
        })}
        description={t('geo.kb-modules-desc', {
          defaultValue:
            '{{filled}} of {{total}} modules filled · {{facts}} entries in the ledger',
          filled: filledCount,
          total: state.modules.length,
          facts: state.fact_count ?? 0,
        })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            buttonRadius="full"
            onClick={openGrid}
          >
            {t('geo.kb-view-entries', { defaultValue: 'View entries' })}
          </Button>
        }
      >
        <ul className="m-0 grid list-none grid-cols-1 gap-ds-8 p-0 @xl:grid-cols-2 @3xl:grid-cols-3">
          {state.modules.map((module) => (
            <li key={module.key} className="flex min-w-0">
              <button
                type="button"
                onClick={() =>
                  openPath(module.path, module.key === '02_产品库')
                }
                title={module.path}
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-ds-4 rounded-ds-field bg-ds-neutral-default-default px-ds-12 py-ds-10 text-left outline-none hover:bg-ds-neutral-muted-default focus-visible:ring-2 focus-visible:ring-ds-ring-focus'
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-ds-8">
                  <DsText
                    as="span"
                    role="base"
                    weight="semibold"
                    className="truncate"
                  >
                    {module.key}
                  </DsText>
                  <Badge
                    variant="secondary"
                    size="xs"
                    tone={module.filled ? 'success' : 'neutral'}
                  >
                    {module.filled
                      ? t('geo.kb-module-filled', { defaultValue: 'Filled' })
                      : t('geo.kb-module-template', {
                          defaultValue: 'Template',
                        })}
                  </Badge>
                </span>
                <DsText
                  as="span"
                  role="meta"
                  className="truncate text-ds-ink-muted-default"
                >
                  {module.products.length > 0
                    ? module.products.join('、')
                    : module.modified_at
                      ? module.modified_at.replace('T', ' ')
                      : '—'}
                </DsText>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
