// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { useTranslation } from 'react-i18next';

import { mockCapturePlatforms } from './mocks/mockData';

export function CapturePanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-capture-title', {
          defaultValue:
            '第 {{round}} 轮 · {{count}} 个问题 × {{platforms}} 个平台',
          round: 3,
          count: 30,
          platforms: 4,
        })}
      </DsText>
      <div className="flex flex-col gap-ds-10">
        {mockCapturePlatforms.map((p) => {
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <div key={p.name} className="flex flex-col gap-ds-4">
              <div className="flex items-center justify-between">
                <DsText as="span" role="base">
                  {p.name}
                </DsText>
                <DsText as="span" role="meta" className="tabular-nums">
                  {t('geo.studio-capture-progress', {
                    defaultValue: '{{done}}/{{total}}',
                    done: p.done,
                    total: p.total,
                  })}
                </DsText>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ds-neutral-subtle-default">
                <div
                  className="h-full rounded-full bg-ds-accent-strong-default"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
