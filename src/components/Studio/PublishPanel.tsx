// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockPublishRecords } from './mocks/mockData';

export function PublishPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-publish-title', { defaultValue: '发布记录' })}
      </DsText>
      <div className="flex flex-col gap-ds-8">
        {mockPublishRecords.map((rec) => (
          <div
            key={rec.id}
            className="flex items-center justify-between gap-ds-8 rounded-ds-card border border-x border-y border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-10"
          >
            <DsText as="p" role="base" className="flex-1">
              {rec.title}
            </DsText>
            <Tag variant="secondary" tone="information" size="xs">
              {rec.platform}
            </Tag>
            <DsText
              as="span"
              role="meta"
              className="text-ds-ink-muted-default tabular-nums"
            >
              {rec.date}
            </DsText>
          </div>
        ))}
      </div>
    </div>
  );
}
