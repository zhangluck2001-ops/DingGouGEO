// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockKpis, mockPlatformMetrics } from './mocks/mockData';

export function MetricsPanel() {
  const { t } = useTranslation();
  const footnote = t('geo.studio-metrics-footnote', {
    defaultValue:
      '同一条回答同时提到两个产品时，两边各记一笔；品牌整体在「全部产品」里看。',
  });
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-metrics-title', {
          defaultValue: '第 {{round}} 轮 vs 第 {{prev}} 轮',
          round: 3,
          prev: 2,
        })}
      </DsText>
      <div className="grid grid-cols-3 gap-ds-8">
        {mockKpis.map((kpi) => {
          const positive = kpi.delta >= 0;
          const deltaLabel = positive
            ? t('geo.studio-metrics-up', {
                defaultValue: '+{{n}}',
                n: kpi.delta,
              })
            : t('geo.studio-metrics-down', {
                defaultValue: '−{{n}}',
                n: Math.abs(kpi.delta),
              });
          return (
            <div
              key={kpi.label}
              className="flex flex-col gap-ds-4 rounded-ds-card bg-ds-neutral-default-default px-ds-12 py-ds-10"
            >
              <DsText as="span" role="meta" className="text-ds-ink-muted-default">
                {kpi.label}
              </DsText>
              <DsText as="span" role="title" weight="semibold">
                {kpi.value}
              </DsText>
              <Tag
                variant="secondary"
                tone={positive ? 'success' : 'error'}
                size="xs"
              >
                {deltaLabel}
              </Tag>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-ds-6 border-x-0 border-b-0 border-t border-solid border-ds-hairline-subtle-default pt-ds-12">
        <DsText as="h3" role="base" weight="semibold">
          {t('geo.studio-metrics-platform-title', { defaultValue: '分平台' })}
        </DsText>
        <div className="flex flex-col gap-ds-2">
          <div className="grid grid-cols-4 gap-ds-8 px-ds-4">
            <DsText as="span" role="meta" weight="semibold">
              {t('geo.studio-metrics-platform', { defaultValue: '平台' })}
            </DsText>
            <DsText as="span" role="meta" weight="semibold" className="text-right tabular-nums">
              {t('geo.studio-metrics-mention-col', { defaultValue: '提及' })}
            </DsText>
            <DsText as="span" role="meta" weight="semibold" className="text-right tabular-nums">
              {t('geo.studio-metrics-first-col', { defaultValue: '首提' })}
            </DsText>
            <DsText as="span" role="meta" weight="semibold" className="text-right tabular-nums">
              {t('geo.studio-metrics-top3-col', { defaultValue: 'TOP3' })}
            </DsText>
          </div>
          {mockPlatformMetrics.map((row) => (
            <div
              key={row.platform}
              className="grid grid-cols-4 gap-ds-8 rounded-ds-field-media px-ds-4 py-ds-6 odd:bg-ds-neutral-subtle-default"
            >
              <DsText as="span" role="base">
                {row.platform}
              </DsText>
              <DsText as="span" role="base" className="text-right tabular-nums">
                {row.mention}
              </DsText>
              <DsText as="span" role="base" className="text-right tabular-nums">
                {row.first}
              </DsText>
              <DsText as="span" role="base" className="text-right tabular-nums">
                {row.top3}
              </DsText>
            </div>
          ))}
        </div>
      </div>
      <DsText as="span" role="meta" className="text-ds-ink-muted-default">
        {footnote}
      </DsText>
    </div>
  );
}
