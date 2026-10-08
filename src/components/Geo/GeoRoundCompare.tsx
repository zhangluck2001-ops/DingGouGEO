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

import { geoApi, type GeoRoundComparison } from '@/api/geo';
import { DsText } from '@/components/ui/ds-text';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Metric = Exclude<
  keyof GeoRoundComparison,
  'id' | 'name' | 'seq' | 'kind' | 'status' | 'started_on' | 'ended_on'
>;

const METRICS: { key: Metric; labelKey: string; defaultLabel: string }[] = [
  { key: 'answers', labelKey: 'geo.cmp-answers', defaultLabel: 'Answers' },
  {
    key: 'answers_with_sources',
    labelKey: 'geo.cmp-answers-with-sources',
    defaultLabel: 'Answers with sources',
  },
  { key: 'citations', labelKey: 'geo.cmp-citations', defaultLabel: 'Sources' },
  {
    key: 'source_domains',
    labelKey: 'geo.cmp-source-domains',
    defaultLabel: 'Source domains',
  },
  { key: 'analyses', labelKey: 'geo.cmp-analyses', defaultLabel: 'Diagnosed' },
  {
    key: 'mentions_own',
    labelKey: 'geo.cmp-mentions-own',
    defaultLabel: 'Mention own brand',
  },
  {
    key: 'recommends_own',
    labelKey: 'geo.cmp-recommends-own',
    defaultLabel: 'Recommend own brand',
  },
  {
    key: 'own_in_top3',
    labelKey: 'geo.cmp-own-in-top3',
    defaultLabel: 'Own brand in top 3',
  },
  {
    key: 'cited_contents',
    labelKey: 'geo.cmp-cited-contents',
    defaultLabel: 'Our content cited',
  },
];

/**
 * Capture rounds side by side (baseline, then each re-capture), as plain
 * counts. Rates come later, once the metric definitions are settled.
 */
export default function GeoRoundCompare({
  projectId,
  refreshKey,
}: {
  projectId: number;
  refreshKey: number;
}) {
  const { t } = useTranslation();
  const [rounds, setRounds] = useState<GeoRoundComparison[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRounds(null);
    void geoApi
      .compareRounds(projectId)
      .then((response) => {
        if (!cancelled) setRounds(response.items);
      })
      .catch(() => {
        if (!cancelled) setRounds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (rounds === null) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-ds-ink-muted-default"
          aria-hidden
        />
      </div>
    );
  }
  if (rounds.length === 0) {
    return (
      <DsText as="p" role="base" className="p-ds-16 text-ds-ink-muted-default">
        {t('geo.cmp-empty', {
          defaultValue:
            'No capture rounds yet. Add one under AI capture → Capture rounds.',
        })}
      </DsText>
    );
  }

  const cell =
    'border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default px-ds-12 py-ds-8';
  return (
    <div className="scrollbar-always-visible min-h-0 flex-1 overflow-auto p-ds-16">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {t('geo.view-round-compare', { defaultValue: 'Round comparison' })}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={cell}>
              <DsText
                as="span"
                role="meta"
                className="text-ds-ink-muted-default"
              >
                {t('geo.field-capture-round', {
                  defaultValue: 'Capture round',
                })}
              </DsText>
            </th>
            {rounds.map((round) => (
              <th key={round.id} scope="col" className={`${cell} text-right`}>
                <DsText as="span" role="base" weight="semibold">
                  {round.name}
                </DsText>
                <DsText
                  as="span"
                  role="meta"
                  className="block text-ds-ink-muted-default"
                >
                  {[
                    round.kind,
                    [round.started_on, round.ended_on]
                      .filter(Boolean)
                      .join(' – '),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </DsText>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => (
            <tr key={metric.key}>
              <th scope="row" className={cell}>
                <DsText as="span" role="base">
                  {t(metric.labelKey, { defaultValue: metric.defaultLabel })}
                </DsText>
              </th>
              {rounds.map((round) => (
                <td
                  key={round.id}
                  className={`${cell} text-right tabular-nums`}
                >
                  <DsText as="span" role="base">
                    {round[metric.key].toLocaleString()}
                  </DsText>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
