// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockDrafts, type DraftStatus } from './mocks/mockData';

const STATUS_KEY: Record<DraftStatus, string> = {
  pending: 'studio-drafts-status-pending',
  published: 'studio-drafts-status-published',
  failed: 'studio-drafts-status-failed',
};

const STATUS_TONE: Record<DraftStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  published: 'success',
  failed: 'error',
};

const STATUS_DEFAULT: Record<DraftStatus, string> = {
  pending: '待改稿',
  published: '已发布',
  failed: '校验未过',
};

export function DraftsPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-drafts-title', { defaultValue: '稿子' })}
      </DsText>
      <div className="flex flex-col gap-ds-8">
        {mockDrafts.map((draft) => {
          const statusLabel = t(`geo.${STATUS_KEY[draft.status]}`, {
            defaultValue: STATUS_DEFAULT[draft.status],
          });
          return (
            <div
              key={draft.id}
              className="flex items-center justify-between gap-ds-8 rounded-ds-card border border-x border-y border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-10"
            >
              <DsText as="p" role="base" className="flex-1">
                {draft.title}
              </DsText>
              <div className="flex items-center gap-ds-4">
                {draft.failDetail ? (
                  <DsText
                    as="span"
                    role="meta"
                    className="text-ds-ink-muted-default"
                  >
                    {t('geo.studio-drafts-status-failed-detail', {
                      defaultValue: '{{detail}}',
                      detail: draft.failDetail,
                    })}
                  </DsText>
                ) : null}
                <Tag
                  variant="secondary"
                  tone={STATUS_TONE[draft.status]}
                  size="xs"
                >
                  {statusLabel}
                </Tag>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
