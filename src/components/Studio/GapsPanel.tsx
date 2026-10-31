// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockGaps, type GapSeverity } from './mocks/mockData';

const SEVERITY_KEY: Record<GapSeverity, string> = {
  high: 'studio-gaps-severity-high',
  mid: 'studio-gaps-severity-mid',
  none: 'studio-gaps-severity-none',
};

const SEVERITY_TONE: Record<GapSeverity, 'error' | 'warning' | 'neutral'> = {
  high: 'error',
  mid: 'warning',
  none: 'neutral',
};

const SEVERITY_DEFAULT: Record<GapSeverity, string> = {
  high: '高',
  mid: '中',
  none: '—',
};

export function GapsPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-gaps-title', { defaultValue: '主要缺口' })}
      </DsText>
      <div className="flex flex-col gap-ds-8">
        {mockGaps.map((gap) => {
          const severityLabel = t(`geo.${SEVERITY_KEY[gap.severity]}`, {
            defaultValue: SEVERITY_DEFAULT[gap.severity],
          });
          return (
            <div
              key={gap.id}
              className="flex items-start justify-between gap-ds-8 rounded-ds-card border border-x border-y border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-10"
            >
              <DsText as="p" role="base" className="flex-1">
                {gap.text}
              </DsText>
              <Tag
                variant="secondary"
                tone={SEVERITY_TONE[gap.severity]}
                size="xs"
              >
                {severityLabel}
              </Tag>
            </div>
          );
        })}
      </div>
    </div>
  );
}
