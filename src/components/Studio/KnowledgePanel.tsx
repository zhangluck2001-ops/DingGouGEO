// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockGradeDistribution, mockKnowledgeModules } from './mocks/mockData';

const SECTION_KEY: Record<string, string> = {
  overview: 'studio-kb-section-overview',
  brand: 'studio-kb-section-brand',
  product: 'studio-kb-section-product',
  compliance: 'studio-kb-section-compliance',
  faq: 'studio-kb-section-faq',
  compare: 'studio-kb-section-compare',
  redline: 'studio-kb-section-redline',
};

const SECTION_DEFAULT: Record<string, string> = {
  overview: '总览',
  brand: '品牌实体',
  product: '产品库',
  compliance: '资质合规',
  faq: 'FAQ',
  compare: '竞品对比',
  redline: '合规红线',
};

export function KnowledgePanel() {
  const { t } = useTranslation();
  const total = mockGradeDistribution.reduce((sum, g) => sum + g.count, 0);
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-kb-title', {
          defaultValue: '知识库 · 七个模块',
        })}
      </DsText>
      <div className="flex flex-col gap-ds-8">
        {mockKnowledgeModules.map((mod) => {
          const label = t(`geo.${SECTION_KEY[mod.key]}`, {
            defaultValue: SECTION_DEFAULT[mod.key],
          });
          return (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-ds-8 rounded-ds-card border border-x border-y border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-10"
            >
              <div className="flex items-center gap-ds-6">
                <DsText as="span" role="base">
                  {label}
                </DsText>
                {mod.fromCard ? (
                  <Tag variant="outline" tone="information" size="xs">
                    {t('geo.studio-kb-from-card', {
                      defaultValue: '来自品牌名片',
                    })}
                  </Tag>
                ) : null}
              </div>
              <DsText
                as="span"
                role="meta"
                className="text-ds-ink-muted-default"
              >
                {t('geo.studio-kb-count', {
                  defaultValue: '{{count}} 条',
                  count: mod.count,
                })}
              </DsText>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-ds-8 border-x-0 border-t border-b-0 border-solid border-ds-hairline-subtle-default pt-ds-12">
        <DsText as="h3" role="base" weight="semibold">
          {t('geo.studio-kb-grade-title', {
            defaultValue: '证据等级分布',
          })}
        </DsText>
        {mockGradeDistribution.map((g) => {
          const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
          return (
            <div key={g.grade} className="flex items-center gap-ds-8">
              <DsText
                as="span"
                role="base"
                weight="semibold"
                className="w-ds-16"
              >
                {g.grade}
              </DsText>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-ds-neutral-subtle-default">
                <div
                  className="h-full rounded-full bg-ds-accent-strong-default"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <DsText
                as="span"
                role="meta"
                className="w-ds-16 text-right tabular-nums"
              >
                {g.count}
              </DsText>
            </div>
          );
        })}
      </div>
    </div>
  );
}
