// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { useTranslation } from 'react-i18next';

import { mockCitationSites } from './mocks/mockData';

export function CitationsPanel() {
  const { t } = useTranslation();
  const max = Math.max(...mockCitationSites.map((s) => s.count), 1);
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-citations-title', { defaultValue: '被引最多的站点' })}
      </DsText>
      <div className="flex flex-col gap-ds-10">
        {mockCitationSites.map((site) => {
          const pct = Math.round((site.count / max) * 100);
          return (
            <div key={site.site} className="flex flex-col gap-ds-4">
              <div className="flex items-center justify-between">
                <DsText as="span" role="base">
                  {site.site}
                </DsText>
                <DsText as="span" role="meta" className="tabular-nums">
                  {site.count}
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
