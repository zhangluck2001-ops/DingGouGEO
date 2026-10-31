// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockProbes } from './mocks/mockData';

export function ProbesPanel() {
  const { t } = useTranslation();
  const lockedLabel = t('geo.studio-probes-locked', { defaultValue: '已锁定' });
  const nonBrandLabel = t('geo.studio-probes-non-brand', {
    defaultValue: '非品牌指向',
  });
  const footnote = t('geo.studio-probes-footnote', {
    defaultValue: '……另 26 个。修改会用在第 4 轮。',
  });

  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <div className="flex items-center gap-ds-8">
        <DsText as="h2" role="body-large" weight="semibold">
          {t('geo.studio-probes-title', {
            defaultValue: '第 {{round}} 轮探针 · {{count}} 个',
            round: 3,
            count: 30,
          })}
        </DsText>
        <Tag variant="secondary" tone="warning" size="sm">
          {lockedLabel}
        </Tag>
      </div>
      <div className="flex flex-col gap-ds-8">
        {mockProbes.map((probe) => (
          <div
            key={probe.id}
            className="flex items-start justify-between gap-ds-8 rounded-ds-card border-x border-y border border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-10"
          >
            <DsText as="p" role="base" className="flex-1">
              {probe.text}
            </DsText>
            {probe.nonBrand ? (
              <Tag variant="outline" tone="information" size="xs">
                {nonBrandLabel}
              </Tag>
            ) : null}
          </div>
        ))}
      </div>
      <DsText as="span" role="meta" className="text-ds-ink-muted-default">
        {footnote}
      </DsText>
    </div>
  );
}
