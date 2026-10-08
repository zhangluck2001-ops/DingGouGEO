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
  type GeoDashboard as Dashboard,
  type GeoChartRow,
  type GeoDatasetKey,
} from '@/api/geo';
import { DsText } from '@/components/ui/ds-text';
import { TooltipSimple } from '@/components/ui/tooltip';
import type { SettingsSectionId } from '@/store/settingsStore';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GeoFacetSelect, GeoStat } from './shared';

export type GeoDashboardKind =
  'data' | 'analysis' | 'sources' | 'content' | 'overview';

interface ChartSpec {
  key: string;
  titleKey: string;
  defaultTitle: string;
  /** Clicking a bar opens the grid filtered by this dataset field. */
  drill?: { dataset: GeoDatasetKey; field: string };
  /** Clicking a bar opens this record instead. */
  openRecord?: GeoDatasetKey;
}

const DATA_CHARTS: ChartSpec[] = [
  {
    key: 'answers_by_platform',
    titleKey: 'geo.chart-answers-by-platform',
    defaultTitle: 'Answers by AI platform',
    drill: { dataset: 'answers', field: 'platform' },
  },
  {
    key: 'answers_by_round',
    titleKey: 'geo.chart-answers-by-round',
    defaultTitle: 'Answers by capture round',
    drill: { dataset: 'answers', field: 'capture_round' },
  },
  {
    key: 'answers_by_web_search',
    titleKey: 'geo.chart-web-search',
    defaultTitle: 'Web search triggered',
    drill: { dataset: 'answers', field: 'web_search' },
  },
  {
    key: 'citations_by_ai_platform',
    titleKey: 'geo.chart-sources-by-platform',
    defaultTitle: 'Sources by AI platform',
    drill: { dataset: 'citations', field: 'ai_platform' },
  },
  {
    key: 'citations_by_type',
    titleKey: 'geo.chart-sources-by-type',
    defaultTitle: 'Sources by type',
    drill: { dataset: 'citations', field: 'source_type' },
  },
  {
    key: 'top_source_sites',
    titleKey: 'geo.chart-top-sites',
    defaultTitle: 'Most cited source sites',
  },
  {
    key: 'probes_by_review_status',
    titleKey: 'geo.chart-probes-by-review',
    defaultTitle: 'Probes by review status',
    drill: { dataset: 'probes', field: 'review_status' },
  },
  {
    key: 'probes_by_cep',
    titleKey: 'geo.chart-probes-by-cep',
    defaultTitle: 'Probes by entry point',
    drill: { dataset: 'probes', field: 'cep' },
  },
];

const OVERVIEW_CHARTS: ChartSpec[] = [
  {
    key: 'answers_by_round',
    titleKey: 'geo.chart-answers-by-round',
    defaultTitle: 'Answers by capture round',
    drill: { dataset: 'answers', field: 'capture_round' },
  },
  {
    key: 'answers_by_platform',
    titleKey: 'geo.chart-answers-by-platform',
    defaultTitle: 'Answers by AI platform',
    drill: { dataset: 'answers', field: 'platform' },
  },
  {
    key: 'citations_by_type',
    titleKey: 'geo.chart-sources-by-type',
    defaultTitle: 'Sources by type',
    drill: { dataset: 'citations', field: 'source_type' },
  },
  {
    key: 'top_source_sites',
    titleKey: 'geo.chart-top-sites',
    defaultTitle: 'Most cited source sites',
  },
  {
    key: 'contents_by_platform',
    titleKey: 'geo.chart-content-by-channel',
    defaultTitle: 'Content by channel',
    drill: { dataset: 'contents', field: 'account_platform' },
  },
  {
    key: 'cited_contents',
    titleKey: 'geo.chart-cited-content',
    defaultTitle: 'Content cited by AI',
    openRecord: 'contents',
  },
  {
    key: 'probes_by_cep',
    titleKey: 'geo.chart-probes-by-cep',
    defaultTitle: 'Probes by entry point',
    drill: { dataset: 'probes', field: 'cep' },
  },
];

const analysisChart = (
  field: string,
  defaultTitle: string,
  drill = true
): ChartSpec => ({
  key: `analyses_by_${field}`,
  titleKey: `geo.chart-analyses-by-${field.replace(/_/g, '-')}`,
  defaultTitle,
  drill: drill ? { dataset: 'analyses', field } : undefined,
});

const ANALYSIS_CHARTS: ChartSpec[] = [
  analysisChart('mentions_own', 'Mentions own brand'),
  analysisChart('recommend_own', 'Recommends own brand'),
  analysisChart('own_in_top3', 'Own brand in top 3'),
  analysisChart('top_brand', 'Top pick', false),
  analysisChart('competitor_relation', 'Competitor relation'),
  analysisChart('sentiment', 'Sentiment'),
];

const SOURCE_CHARTS: ChartSpec[] = [
  {
    key: 'top_source_sites',
    titleKey: 'geo.chart-top-sites',
    defaultTitle: 'Most cited source sites',
  },
  {
    key: 'top_domains',
    titleKey: 'geo.chart-top-domains',
    defaultTitle: 'Most cited domains',
  },
  {
    key: 'citations_by_ai_platform',
    titleKey: 'geo.chart-sources-by-platform',
    defaultTitle: 'Sources by AI platform',
    drill: { dataset: 'citations', field: 'ai_platform' },
  },
  {
    key: 'citations_by_type',
    titleKey: 'geo.chart-sources-by-type',
    defaultTitle: 'Sources by type',
    drill: { dataset: 'citations', field: 'source_type' },
  },
];

const CONTENT_CHARTS: ChartSpec[] = [
  {
    key: 'contents_by_status',
    titleKey: 'geo.chart-content-by-status',
    defaultTitle: 'Content by status',
    drill: { dataset: 'contents', field: 'status' },
  },
  {
    key: 'contents_by_platform',
    titleKey: 'geo.chart-content-by-channel',
    defaultTitle: 'Content by channel',
    drill: { dataset: 'contents', field: 'account_platform' },
  },
  {
    key: 'cited_contents',
    titleKey: 'geo.chart-cited-content',
    defaultTitle: 'Content cited by AI',
    openRecord: 'contents',
  },
];

function BarList({
  rows,
  onSelect,
}: {
  rows: GeoChartRow[];
  onSelect?: (row: GeoChartRow) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <DsText as="p" role="meta" className="text-ds-ink-muted-default">
        {t('geo.chart-empty', { defaultValue: 'No data yet' })}
      </DsText>
    );
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <ul className="m-0 flex list-none flex-col gap-ds-6 p-0">
      {rows.map((row) => {
        const share = total ? Math.round((row.value / total) * 1000) / 10 : 0;
        const content = (
          <>
            <DsText
              as="span"
              role="meta"
              className="w-2/5 shrink-0 truncate text-ds-ink-default-default"
            >
              {row.label}
            </DsText>
            <span className="flex h-6 min-w-0 flex-1 items-center" aria-hidden>
              <span
                className="h-2 rounded-r-ds-4 bg-ds-accent-strong-default"
                style={{ width: `max(2px, ${(row.value / max) * 100}%)` }}
              />
            </span>
            <DsText
              as="span"
              role="meta"
              className="w-14 shrink-0 text-right text-ds-ink-default-default tabular-nums"
            >
              {row.value.toLocaleString()}
            </DsText>
          </>
        );
        const tooltip = `${row.label} · ${row.value.toLocaleString()} (${share}%)`;
        return (
          <li key={`${row.id ?? ''}${row.label}`}>
            <TooltipSimple content={tooltip} side="top" variant="instant">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(row)}
                  aria-label={tooltip}
                  className="flex w-full min-w-0 items-center gap-ds-8 rounded-ds-compact-control text-left outline-none hover:bg-ds-neutral-muted-default focus-visible:ring-2 focus-visible:ring-ds-ring-focus"
                >
                  {content}
                </button>
              ) : (
                <div
                  className="flex w-full min-w-0 items-center gap-ds-8"
                  aria-label={tooltip}
                >
                  {content}
                </div>
              )}
            </TooltipSimple>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Dashboard view: headline counts plus one bar list per breakdown. Bars
 * drill into the grid with that value filtered.
 */
export default function GeoDashboard({
  kind,
  projectId,
  refreshKey,
  onDrill,
  onOpenRecord,
  onOpenStage,
}: {
  kind: GeoDashboardKind;
  projectId: number;
  refreshKey: number;
  onDrill: (dataset: GeoDatasetKey, field: string, value: string) => void;
  onOpenRecord: (dataset: GeoDatasetKey, id: number) => void;
  onOpenStage?: (section: SettingsSectionId) => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  // '' = every capture round; content numbers don't depend on rounds.
  const [round, setRound] = useState('');
  const byRound = kind !== 'content';

  useEffect(() => {
    setRound('');
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void geoApi
      .dashboard(projectId, byRound ? round : undefined)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [byRound, projectId, refreshKey, round]);

  if (loading && !data) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-ds-ink-muted-default"
          aria-hidden
        />
      </div>
    );
  }
  if (!data) {
    return (
      <DsText as="p" role="base" className="p-ds-16 text-ds-ink-muted-default">
        {t('geo.load-failed', { defaultValue: "Couldn't load this record." })}
      </DsText>
    );
  }

  const { totals, charts } = data;
  const stat = (key: string, defaultValue: string, value: number) => ({
    label: t(key, { defaultValue }),
    value,
  });
  const tiles =
    kind === 'analysis'
      ? [
          stat('geo.stat-analyses', 'Answers diagnosed', totals.analyses),
          stat(
            'geo.stat-mentions-own',
            'Mention own brand',
            totals.mentions_own
          ),
          stat(
            'geo.stat-recommends-own',
            'Recommend own brand',
            totals.recommends_own
          ),
          stat(
            'geo.stat-own-in-top3',
            'Own brand in top 3',
            totals.own_in_top3
          ),
        ]
      : kind === 'sources'
        ? [
            stat('geo.stat-sources', 'Sources captured', totals.citations),
            stat(
              'geo.stat-source-domains',
              'Source domains',
              totals.source_domains
            ),
            stat(
              'geo.stat-answers-with-sources',
              'Answers with sources',
              totals.answers_with_sources
            ),
            stat('geo.stat-cited', 'Cited by AI', totals.cited_contents),
          ]
        : kind === 'data'
          ? [
              stat('geo.stat-answers', 'Answers captured', totals.answers),
              stat(
                'geo.stat-answers-with-sources',
                'Answers with sources',
                totals.answers_with_sources
              ),
              stat('geo.stat-sources', 'Sources captured', totals.citations),
              stat('geo.stat-probes', 'Probes', totals.probes),
            ]
          : [
              stat('geo.stat-produced', 'Produced', totals.contents),
              stat('geo.stat-published', 'Published', totals.published),
              stat('geo.stat-cited', 'Cited by AI', totals.cited_contents),
              stat(
                'geo.stat-channels',
                'Channels',
                charts.contents_by_platform?.length ?? 0
              ),
            ];
  const specs = {
    overview: OVERVIEW_CHARTS,
    data: DATA_CHARTS,
    analysis: ANALYSIS_CHARTS,
    sources: SOURCE_CHARTS,
    content: CONTENT_CHARTS,
  }[kind];
  const stages = [
    {
      section: 'geo-knowledge',
      label: t('layout.geo-knowledge', {
        defaultValue: 'Brand knowledge base',
      }),
      value: totals.facts,
      note: t('geo.stage-facts', { defaultValue: 'knowledge entries' }),
    },
    {
      section: 'geo-probes',
      label: t('layout.geo-probes', { defaultValue: 'Intent probes' }),
      value: totals.probes,
    },
    {
      section: 'geo-answers',
      label: t('layout.geo-answers', { defaultValue: 'AI capture' }),
      value: totals.answers,
      note: t('geo.stage-with-sources', {
        defaultValue: '{{count}} with sources',
        count: totals.answers_with_sources,
        formatted: totals.answers_with_sources.toLocaleString(),
      }),
    },
    {
      section: 'geo-analysis',
      label: t('layout.geo-analysis', { defaultValue: 'Diagnosis' }),
      value: totals.analyses,
      note: t('geo.stage-mentions-own', {
        defaultValue: '{{count}} mention own brand',
        count: totals.mentions_own,
        formatted: totals.mentions_own.toLocaleString(),
      }),
    },
    {
      section: 'geo-citations',
      label: t('layout.geo-citations', { defaultValue: 'Cited sources' }),
      value: totals.citations,
    },
    {
      section: 'geo-drafts',
      label: t('layout.geo-drafts', { defaultValue: 'Content production' }),
      value: totals.contents,
      note: t('geo.stage-unpublished', {
        defaultValue: '{{count}} not published',
        count: totals.contents - totals.published,
        formatted: (totals.contents - totals.published).toLocaleString(),
      }),
    },
    {
      section: 'geo-published',
      label: t('layout.geo-published', {
        defaultValue: 'Publishing and tracking',
      }),
      value: totals.published,
      note: t('geo.stage-cited', {
        defaultValue: '{{count}} cited by AI',
        count: totals.cited_contents,
        formatted: totals.cited_contents.toLocaleString(),
      }),
    },
  ] as const;

  const roundLabel = t('geo.field-capture-round', {
    defaultValue: 'Capture round',
  });

  return (
    <div className="scrollbar-always-visible @container min-h-0 flex-1 overflow-y-auto p-ds-16">
      {byRound && data.rounds.length > 0 ? (
        <div className="mb-ds-12 flex flex-wrap items-center gap-ds-8">
          <GeoFacetSelect
            label={roundLabel}
            allLabel={`${roundLabel}: ${t('geo.all', { defaultValue: 'All' })}`}
            values={data.rounds.map((item) => ({
              value: item.label,
              count: item.value,
            }))}
            value={round}
            onChange={setRound}
          />
          {data.rounds
            .filter((item) => !round || item.label === round)
            .map((item) => (
              <DsText
                key={item.id}
                as="span"
                role="meta"
                className="text-ds-ink-muted-default"
              >
                {[
                  item.label,
                  item.kind,
                  item.status,
                  [item.started_on, item.ended_on].filter(Boolean).join(' – '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </DsText>
            ))}
        </div>
      ) : null}
      {kind === 'overview' ? (
        <ol
          aria-label={t('layout.geo-pipeline', {
            defaultValue: 'GEO pipeline',
          })}
          className="m-0 grid list-none grid-cols-2 gap-ds-8 p-0 @2xl:grid-cols-3"
        >
          {stages.map((stage, index) => (
            <li key={stage.section} className="flex min-w-0">
              <button
                type="button"
                onClick={() => onOpenStage?.(stage.section)}
                className="flex min-w-0 flex-1 flex-col gap-ds-2 rounded-ds-card bg-ds-neutral-default-default px-ds-16 py-ds-12 text-left outline-none hover:bg-ds-neutral-muted-default focus-visible:ring-2 focus-visible:ring-ds-ring-focus"
              >
                <DsText
                  as="span"
                  role="meta"
                  className="text-ds-ink-muted-default"
                >
                  {index + 1} · {stage.label}
                </DsText>
                <DsText
                  as="span"
                  role="title"
                  weight="semibold"
                  className="tabular-nums"
                >
                  {stage.value.toLocaleString()}
                </DsText>
                {'note' in stage ? (
                  <DsText
                    as="span"
                    role="meta"
                    className="truncate text-ds-ink-muted-default"
                  >
                    {stage.note}
                  </DsText>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="grid grid-cols-2 gap-ds-8 @2xl:grid-cols-4">
          {tiles.map((tile) => (
            <GeoStat
              key={tile.label}
              label={tile.label}
              value={tile.value.toLocaleString()}
            />
          ))}
        </div>
      )}
      <div className="mt-ds-12 grid grid-cols-1 gap-ds-12 @2xl:grid-cols-2">
        {specs.map((spec) => (
          <section
            key={spec.key}
            className="flex min-w-0 flex-col gap-ds-12 rounded-ds-card border border-x border-y border-solid border-ds-hairline-default-default p-ds-16"
          >
            <DsText as="h2" role="base" weight="semibold">
              {t(spec.titleKey, { defaultValue: spec.defaultTitle })}
            </DsText>
            <BarList
              rows={charts[spec.key] ?? []}
              onSelect={
                spec.drill
                  ? (row) =>
                      onDrill(spec.drill!.dataset, spec.drill!.field, row.label)
                  : spec.openRecord
                    ? (row) =>
                        row.id != null && onOpenRecord(spec.openRecord!, row.id)
                    : undefined
              }
            />
          </section>
        ))}
      </div>
    </div>
  );
}
