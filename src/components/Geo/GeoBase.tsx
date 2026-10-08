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
  type GeoDatasetKey,
  type GeoFacetValue,
  type GeoRecord,
} from '@/api/geo';
import SearchInput from '@/components/Dashboard/SearchInput';
import CollectionToolbar, {
  COLLECTION_TOOLBAR_SEARCH_CLASS,
} from '@/components/Layout/CollectionToolbar';
import { useFocusContentHeading } from '@/components/Layout/ContentHeader';
import AlertDialog from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DsText } from '@/components/ui/ds-text';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipSimple } from '@/components/ui/tooltip';
import { useWorkbenchChrome } from '@/components/Workbench';
import { useWorkbenchStore } from '@/store/workbenchStore';
import {
  Bot,
  Columns3,
  Database,
  KanbanSquare,
  LayoutDashboard,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fieldLabel,
  GEO_DATASETS,
  recordTitle,
  type GeoDatasetConfig,
} from './datasets';
import GeoDashboard, { type GeoDashboardKind } from './GeoDashboard';
import GeoGrid, { type GeoSort } from './GeoGrid';
import GeoKanban from './GeoKanban';
import GeoRecordPanel from './GeoRecordPanel';
import { GEO_STAGE_FOR_DATASET, useOpenGeoStage } from './navigation';
import {
  GEO_PAGE_SIZE,
  GeoEmptyState,
  GeoFacetSelect,
  GeoPager,
  useDebounced,
  useGeoProject,
} from './shared';
import { useGeoFieldPrefs } from './useGeoFieldPrefs';

export type GeoView = 'grid' | 'kanban' | 'dashboard' | 'custom';

/** A stage-specific view shown beside the grid (e.g. knowledge-base files). */
export interface GeoCustomView {
  icon: LucideIcon;
  label: string;
  render: (context: {
    projectId: number;
    refreshKey: number;
    refresh: () => void;
    openGrid: () => void;
  }) => ReactNode;
}

/**
 * A stage's own job for the agent: the button drops an instruction into the
 * chat box, where people can adjust it before sending.
 */
export interface GeoAgentTask {
  label: string;
  prompt: (context: {
    project: string;
    /** The Space's database file. */
    db: string;
    /** The Space's GEO folder. */
    geoRoot: string;
    /** Capture round being looked at, if one is picked. */
    round: string | null;
  }) => string;
}

const TABLE_NAMES: Record<GeoDatasetKey, string> = {
  rounds: 'geo_capture_round',
  answers: 'geo_answer',
  analyses: 'geo_answer_analysis',
  citations: 'geo_citation',
  probes: 'geo_probe',
  contents: 'geo_content',
  facts: 'geo_fact',
  gaps: 'geo_gap',
  benchmarks: 'geo_benchmark',
};
const MAX_ROWS_IN_PROMPT = 30;

type PanelState = {
  id: number | 'new';
  initial?: Record<string, string>;
} | null;

function clip(value: unknown, length = 80) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export default function GeoBase({
  sectionId,
  title,
  datasets,
  views,
  dashboardKind = 'data',
  fixedFilters,
  defaultSort,
  customView,
  agentTask,
}: {
  sectionId: string;
  title: string;
  datasets: GeoDatasetKey[];
  views: GeoView[];
  dashboardKind?: GeoDashboardKind;
  /** Filters this stage always applies (e.g. published content only). */
  fixedFilters?: Record<string, string>;
  defaultSort?: GeoSort;
  customView?: GeoCustomView;
  agentTask?: GeoAgentTask;
}) {
  const { t } = useTranslation();
  const headingRef = useFocusContentHeading(sectionId);
  const sendToChat = useWorkbenchStore((state) => state.sendToChat);
  const [refreshKey, setRefreshKey] = useState(0);
  const {
    project,
    projectId,
    loading: projectLoading,
  } = useGeoProject(refreshKey);
  const [dataset, setDataset] = useState<GeoDatasetKey>(datasets[0]);
  const [view, setView] = useState<GeoView>(views[0]);
  const [filtersByDataset, setFiltersByDataset] = useState<
    Partial<Record<GeoDatasetKey, Record<string, string>>>
  >({});
  const [sortByDataset, setSortByDataset] = useState<
    Partial<Record<GeoDatasetKey, GeoSort>>
  >({});
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<GeoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Record<string, GeoFacetValue[]>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<number, GeoRecord>>(new Map());
  const [panel, setPanel] = useState<PanelState>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const config: GeoDatasetConfig = GEO_DATASETS[dataset];
  const fixedKey = JSON.stringify(fixedFilters ?? {});
  const filters = useMemo(
    () => ({ ...(filtersByDataset[dataset] ?? {}), ...JSON.parse(fixedKey) }),
    [dataset, filtersByDataset, fixedKey]
  ) as Record<string, string>;
  const sort = sortByDataset[dataset] ?? defaultSort ?? config.defaultSort;
  const openGeoStage = useOpenGeoStage();
  const chrome = useWorkbenchChrome();
  const isRecordView = view === 'grid' || view === 'kanban';
  const geoDrill = useWorkbenchStore((state) => state.geoDrill);
  const setGeoDrill = useWorkbenchStore((state) => state.setGeoDrill);
  const prefs = useGeoFieldPrefs(dataset);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const datasetLabel = t(config.labelKey, {
    defaultValue: config.defaultLabel,
  });

  // Another stage (e.g. the overview) asked this page to open pre-filtered.
  useEffect(() => {
    if (!geoDrill || !datasets.includes(geoDrill.dataset)) return;
    setDataset(geoDrill.dataset);
    if (geoDrill.field && geoDrill.value) {
      setFiltersByDataset((current) => ({
        ...current,
        [geoDrill.dataset]: {
          [geoDrill.field as string]: geoDrill.value as string,
        },
      }));
    }
    setView(views.includes('grid') ? 'grid' : views[0]);
    if (geoDrill.recordId != null) {
      const id = geoDrill.recordId;
      setTimeout(() => setPanel({ id }), 0);
    }
    setGeoDrill(null);
  }, [datasets, geoDrill, setGeoDrill, views]);

  useEffect(() => {
    setPage(1);
  }, [dataset, debouncedQuery, projectId, filters, sort.field, sort.order]);

  useEffect(() => {
    setSelected(new Map());
    setPanel(null);
  }, [dataset, projectId]);

  useEffect(() => {
    if (projectId == null || !isRecordView) return;
    let cancelled = false;
    setLoading(true);
    void geoApi
      .list(dataset, {
        project_id: projectId,
        ...filters,
        q: debouncedQuery,
        sort: sort.field,
        order: sort.order,
        page,
        page_size: GEO_PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        setRows(response.items);
        setTotal(response.total);
        setFacets(response.facets);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    dataset,
    isRecordView,
    filters,
    debouncedQuery,
    sort.field,
    sort.order,
    page,
    refreshKey,
  ]);

  const setFilter = (field: string, value: string) =>
    setFiltersByDataset((current) => ({
      ...current,
      [dataset]: { ...(current[dataset] ?? {}), [field]: value },
    }));

  const projectName = project?.name ?? '';
  const dbPath = project?.db_path ?? 'GEO/geo.db';
  const geoRoot = dbPath.replace(/\/geo\.db$/, '');

  const sendAgentTask = () => {
    if (!agentTask) return;
    sendToChat(
      agentTask.prompt({
        project: projectName,
        db: dbPath,
        geoRoot,
        round: filters.capture_round || null,
      })
    );
    toast.success(
      t('geo.sent-to-chat', { defaultValue: 'Added to the chat box' })
    );
  };

  const describeFilters = () => {
    const active = Object.entries(filters).filter(([, value]) => value);
    const parts = active.map(([key, value]) => {
      const field = config.fields.find((item) => item.key === key);
      return `${field ? fieldLabel(t, field) : key}=${value}`;
    });
    if (debouncedQuery)
      parts.push(
        `${t('geo.search', { defaultValue: 'Search' })}="${debouncedQuery}"`
      );
    return parts.length
      ? parts.join('，')
      : t('geo.no-filters', { defaultValue: 'none' });
  };

  const askAiAboutRecords = (records: GeoRecord[]) => {
    const fields = prefs.visibleFields.filter(
      (field) => field.key !== config.titleField
    );
    const lines = records.slice(0, MAX_ROWS_IN_PROMPT).map((record, index) => {
      const detail = fields
        .map((field) => record[field.key])
        .filter(
          (value) => value !== null && value !== undefined && value !== ''
        )
        .map((value) => clip(value, 40))
        .join(' · ');
      return `${index + 1}. [id=${record.id}] ${clip(recordTitle(config, record))}${detail ? ` — ${detail}` : ''}`;
    });
    const more =
      records.length > MAX_ROWS_IN_PROMPT
        ? `\n${t('geo.ai-prompt-more', { defaultValue: '…and {{count}} more (look them up by id)', count: records.length - MAX_ROWS_IN_PROMPT })}`
        : '';
    sendToChat(
      `${t('geo.ai-prompt-records', {
        defaultValue:
          'Analyze these {{count}} {{dataset}} records from the local GEO database ({{db}}, table {{table}}, project {{project}}):',
        count: records.length,
        dataset: datasetLabel,
        db: dbPath,
        table: TABLE_NAMES[dataset],
        project: projectName,
      })}\n${lines.join('\n')}${more}`
    );
    toast.success(
      t('geo.sent-to-chat', { defaultValue: 'Added to the chat box' })
    );
  };

  const askAiAboutView = () => {
    sendToChat(
      t('geo.ai-prompt-view', {
        defaultValue:
          'Using the local GEO database ({{db}}, table {{table}}), analyze the current {{dataset}} view: project {{project}}, filters {{filters}}, {{count}} records.',
        db: dbPath,
        table: TABLE_NAMES[dataset],
        dataset: datasetLabel,
        project: projectName,
        filters: describeFilters(),
        count: total,
      })
    );
    toast.success(
      t('geo.sent-to-chat', { defaultValue: 'Added to the chat box' })
    );
  };

  const deleteSelected = async () => {
    const ids = [...selected.keys()];
    if (projectId == null) return;
    try {
      const result = await geoApi.remove(dataset, ids, projectId);
      toast.success(
        t('geo.records-deleted', {
          defaultValue: '{{count}} deleted',
          count: result.deleted,
        })
      );
      setSelected(new Map());
      if (panel && typeof panel.id === 'number' && selected.has(panel.id))
        setPanel(null);
      refresh();
    } catch (error) {
      toast.error(
        t('geo.record-delete-failed', {
          defaultValue: "Couldn't delete. Try again.",
        }),
        { description: error instanceof Error ? error.message : undefined }
      );
    }
  };

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const handleSelectedIdsChange = (ids: Set<number>) => {
    setSelected((current) => {
      const next = new Map<number, GeoRecord>();
      ids.forEach((id) => {
        const record = current.get(id) ?? rows.find((row) => row.id === id);
        if (record) next.set(id, record);
      });
      return next;
    });
  };

  const facetFields = config.fields.filter(
    (field) =>
      field.facet &&
      !(fixedFilters && field.key in fixedFilters) &&
      field.key !== (view === 'kanban' ? config.kanbanField : '')
  );
  const kanbanValues = config.kanbanField
    ? (facets[config.kanbanField] ?? []).map((item) => item.value)
    : [];
  const hasProject = project != null;
  const activeRecordId =
    panel && typeof panel.id === 'number' ? panel.id : null;

  const viewMeta: Record<GeoView, { icon: typeof Table2; label: string }> = {
    grid: { icon: Table2, label: t('geo.view-grid', { defaultValue: 'Grid' }) },
    kanban: {
      icon: KanbanSquare,
      label: t('geo.view-kanban', { defaultValue: 'Kanban' }),
    },
    dashboard: {
      icon: LayoutDashboard,
      label: t('geo.view-dashboard', { defaultValue: 'Dashboard' }),
    },
    custom: {
      icon: customView?.icon ?? LayoutDashboard,
      label: customView?.label ?? '',
    },
  };

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <CollectionToolbar
        persistentHeader
        aria-label={title}
        title={title}
        headingLevel={1}
        width="wide"
        headingRef={headingRef}
        className="max-w-none px-ds-16"
        count={
          !isRecordView ? undefined : (
            <Badge variant="secondary" size="xs">
              {total.toLocaleString()}
            </Badge>
          )
        }
      >
        {views.length > 1 ? (
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as GeoView)}
          >
            <TabsList appearance="default">
              {views.map((item) => {
                const Icon = viewMeta[item].icon;
                return (
                  <TabsTrigger
                    key={item}
                    value={item}
                    aria-label={viewMeta[item].label}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="hidden @xl:inline">
                      {viewMeta[item].label}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        ) : null}
        {hasProject && agentTask ? (
          <Button
            variant="primary"
            size="sm"
            buttonRadius="full"
            onClick={sendAgentTask}
          >
            <Bot aria-hidden />
            {agentTask.label}
          </Button>
        ) : null}
        {hasProject ? (
          <TooltipSimple
            content={t('geo.ask-ai-view', {
              defaultValue: 'Ask AI about this view',
            })}
          >
            <Button
              variant="secondary"
              size="sm"
              buttonRadius="full"
              onClick={askAiAboutView}
            >
              <Sparkles aria-hidden />
              {t('geo.ask-ai', { defaultValue: 'Ask AI' })}
            </Button>
          </TooltipSimple>
        ) : null}
        {chrome ? (
          <Button
            variant="ghost"
            size="sm"
            buttonRadius="full"
            buttonContent="icon-only"
            onClick={chrome.onClose}
            aria-label={t('layout.workbench-hide', {
              defaultValue: 'Hide workbench',
            })}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </CollectionToolbar>

      {!hasProject && !projectLoading ? (
        <GeoEmptyState
          icon={Database}
          title={t('geo.space-not-ready-title', {
            defaultValue: 'Setting up this Space',
          })}
          description={t('geo.space-not-ready-desc', {
            defaultValue:
              'Each Space is one brand project. Its GEO folder and database are created the first time the Space opens.',
          })}
        />
      ) : (
        <div className="@container flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-ds-8 px-ds-16 py-ds-8">
            {datasets.length > 1 && isRecordView ? (
              <Tabs
                value={dataset}
                onValueChange={(value) => setDataset(value as GeoDatasetKey)}
              >
                <TabsList appearance="default">
                  {datasets.map((key) => (
                    <TabsTrigger key={key} value={key}>
                      {t(GEO_DATASETS[key].labelKey, {
                        defaultValue: GEO_DATASETS[key].defaultLabel,
                      })}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}
            {isRecordView
              ? facetFields.map((field) => {
                  const label = fieldLabel(t, field);
                  return (
                    <GeoFacetSelect
                      key={field.key}
                      label={label}
                      allLabel={`${label}: ${t('geo.all', { defaultValue: 'All' })}`}
                      values={facets[field.key]}
                      value={filters[field.key] ?? ''}
                      onChange={(value) => setFilter(field.key, value)}
                    />
                  );
                })
              : null}
            {isRecordView ? (
              <div className="ml-auto flex items-center gap-ds-8">
                {view === 'grid' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" buttonRadius="full">
                        <Columns3 aria-hidden />
                        {t('geo.fields', { defaultValue: 'Fields' })}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="max-h-80 overflow-y-auto"
                    >
                      <DropdownMenuLabel>
                        {t('geo.fields-shown', {
                          defaultValue: 'Shown in grid',
                        })}
                      </DropdownMenuLabel>
                      {prefs.fields.map((field) => (
                        <DropdownMenuCheckboxItem
                          key={field.key}
                          checked={prefs.isVisible(field)}
                          onCheckedChange={(checked) =>
                            prefs.setVisible(field.key, Boolean(checked))
                          }
                          onSelect={(event) => event.preventDefault()}
                        >
                          {fieldLabel(t, field)}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={prefs.reset}>
                        {t('geo.fields-reset', {
                          defaultValue: 'Reset columns',
                        })}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  buttonRadius="full"
                  onClick={() =>
                    setPanel({
                      id: 'new',
                      // New captures go into the round being looked at.
                      initial: filters.capture_round
                        ? { capture_round: filters.capture_round }
                        : undefined,
                    })
                  }
                >
                  <Plus aria-hidden />
                  {t('geo.add-record', { defaultValue: 'Add record' })}
                </Button>
                <div className={COLLECTION_TOOLBAR_SEARCH_CLASS}>
                  <SearchInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    ariaLabel={t('geo.search', { defaultValue: 'Search' })}
                    placeholder={t('geo.search', { defaultValue: 'Search' })}
                    clearOnEscape
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative flex min-h-0 flex-1 border-x-0 border-t border-b-0 border-solid border-ds-hairline-default-default">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {projectId == null ? null : view === 'custom' && customView ? (
                customView.render({
                  projectId,
                  refreshKey,
                  refresh,
                  openGrid: () => setView('grid'),
                })
              ) : view === 'dashboard' ? (
                <GeoDashboard
                  kind={dashboardKind}
                  projectId={projectId}
                  onOpenStage={(section) => openGeoStage(section)}
                  refreshKey={refreshKey}
                  onDrill={(target, field, value) => {
                    if (!datasets.includes(target)) {
                      openGeoStage(GEO_STAGE_FOR_DATASET[target], {
                        dataset: target,
                        field,
                        value,
                      });
                      return;
                    }
                    setDataset(target);
                    setFiltersByDataset((current) => ({
                      ...current,
                      [target]: { [field]: value },
                    }));
                    setView('grid');
                  }}
                  onOpenRecord={(target, id) => {
                    if (!datasets.includes(target)) {
                      openGeoStage(GEO_STAGE_FOR_DATASET[target], {
                        dataset: target,
                        recordId: id,
                      });
                      return;
                    }
                    setDataset(target);
                    setView('grid');
                    setTimeout(() => setPanel({ id }), 0);
                  }}
                />
              ) : view === 'kanban' && config.kanbanField ? (
                <GeoKanban
                  config={config}
                  projectId={projectId}
                  groupValues={kanbanValues}
                  filters={filters}
                  query={debouncedQuery}
                  refreshKey={refreshKey}
                  activeId={activeRecordId}
                  onOpen={(record) => setPanel({ id: record.id })}
                  onCreate={(initial) => setPanel({ id: 'new', initial })}
                  onChanged={refresh}
                />
              ) : (
                <>
                  <GeoGrid
                    caption={`${title} · ${datasetLabel}`}
                    fields={prefs.visibleFields}
                    rows={rows}
                    loading={loading}
                    sort={sort}
                    onSortChange={(next) =>
                      setSortByDataset((current) => ({
                        ...current,
                        [dataset]: next,
                      }))
                    }
                    onResize={prefs.setWidth}
                    selectedIds={selectedIds}
                    onSelectedIdsChange={handleSelectedIdsChange}
                    activeId={activeRecordId}
                    onOpen={(record) => setPanel({ id: record.id })}
                  />
                  {selected.size > 0 ? (
                    <div className="flex h-11 shrink-0 items-center gap-ds-8 border-x-0 border-t border-b-0 border-solid border-ds-hairline-default-default bg-ds-neutral-default-default px-ds-16">
                      <DsText as="span" role="base" weight="semibold">
                        {t('geo.selected-count', {
                          defaultValue: '{{count}} selected',
                          count: selected.size,
                        })}
                      </DsText>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          askAiAboutRecords([...selected.values()])
                        }
                      >
                        <Sparkles aria-hidden />
                        {t('geo.ask-ai', { defaultValue: 'Ask AI' })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        tone="error"
                        onClick={() => setConfirmBulkDelete(true)}
                      >
                        <Trash2 aria-hidden />
                        {t('geo.delete', { defaultValue: 'Delete' })}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        buttonContent="icon-only"
                        className="ml-auto"
                        onClick={() => setSelected(new Map())}
                        aria-label={t('geo.clear-selection', {
                          defaultValue: 'Clear selection',
                        })}
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                  <GeoPager page={page} total={total} onPageChange={setPage} />
                </>
              )}
            </div>

            {panel && projectId != null && isRecordView ? (
              <GeoRecordPanel
                key={`${dataset}-${panel.id}`}
                config={config}
                projectId={projectId}
                recordId={panel.id}
                facets={facets}
                initialValues={panel.initial}
                onClose={() => setPanel(null)}
                onSaved={(record) => {
                  setPanel({ id: record.id });
                  refresh();
                }}
                onDeleted={() => {
                  setPanel(null);
                  refresh();
                }}
                onAskAi={(record) => askAiAboutRecords([record])}
              />
            ) : null}
          </div>
        </div>
      )}

      <AlertDialog
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          setConfirmBulkDelete(false);
          void deleteSelected();
        }}
        title={t('geo.delete-confirm-title', {
          defaultValue: 'Delete {{count}} records?',
          count: selected.size,
        })}
        message={t('geo.delete-confirm-desc', {
          defaultValue:
            'They are removed from the local board. Syncing from Feishu won’t bring them back.',
        })}
        confirmText={t('geo.delete', { defaultValue: 'Delete' })}
        cancelText={t('layout.cancel')}
        confirmVariant="primary"
        confirmTone="error"
      />
    </div>
  );
}
