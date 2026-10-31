// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  mockCleaningUsage,
  mockCleanSteps,
  mockPendingFacts,
  type CleanActor,
  type CleanStepStatus,
  type EvidenceGrade,
} from './mocks/mockData';

const STATUS_DOT: Record<CleanStepStatus, string> = {
  done: 'bg-ds-bg-success-strong-default text-ds-ink-inverse',
  doing: 'bg-ds-bg-warning-strong-default text-ds-ink-inverse',
  todo: 'bg-ds-neutral-muted-default text-ds-ink-default-default',
};

const GRADE_TONE: Record<
  EvidenceGrade,
  'success' | 'information' | 'neutral' | 'warning' | 'error'
> = {
  A: 'success',
  B: 'information',
  C: 'neutral',
  D: 'warning',
  E: 'error',
};

const ACTOR_KEY: Record<CleanActor, string> = {
  program: 'studio-clean-actor-program',
  ai: 'studio-clean-actor-ai',
  you: 'studio-clean-actor-you',
};

export function CleanPanel() {
  const { t } = useTranslation();
  const [showBackend, setShowBackend] = useState(true);
  const toggleLabel = t('geo.studio-clean-toggle-backend', {
    defaultValue: '显示后台在做什么',
  });
  const confirmLabel = t('geo.studio-clean-cta-confirm', {
    defaultValue: '确认入库',
  });
  const rejectLabel = t('geo.studio-clean-cta-reject', {
    defaultValue: '驳回',
  });
  const sourceLabel = t('geo.studio-clean-cta-source', {
    defaultValue: '看原文',
  });
  const batchCta = t('geo.studio-clean-batch-cta', {
    defaultValue: '一键确认其余 {{count}} 条 A/B 级',
    count: 4,
  });

  return (
    <div className="flex flex-col gap-ds-16 p-ds-16">
      <DsText as="h2" role="body-large" weight="semibold">
        {t('geo.studio-clean-title', { defaultValue: '清洗流程' })}
      </DsText>

      <div className="flex items-center gap-ds-6 self-start">
        <Switch
          checked={showBackend}
          onCheckedChange={setShowBackend}
          size="sm"
          aria-label={toggleLabel}
        />
        <DsText as="span" role="meta">
          {toggleLabel}
        </DsText>
      </div>

      <ol className="flex flex-col gap-ds-12">
        {mockCleanSteps.map((step) => {
          const stepLabel = t(`geo.studio-clean-step-${step.seq}`, {
            defaultValue: step.title,
          });
          const actorLabel = t(`geo.${ACTOR_KEY[step.actor]}`, {
            defaultValue: step.actor,
          });
          return (
            <li key={step.seq} className="flex gap-ds-12">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ds-text-meta font-bold',
                  STATUS_DOT[step.status],
                )}
              >
                {step.seq}
              </span>
              <div className="flex flex-1 flex-col gap-ds-4">
                <div className="flex items-center justify-between gap-ds-8">
                  <DsText as="span" role="base" weight="semibold">
                    {stepLabel}
                  </DsText>
                  <Tag variant="secondary" tone="neutral" size="xs">
                    {actorLabel}
                  </Tag>
                </div>
                <DsText as="span" role="meta" className="text-ds-ink-muted-default">
                  {step.detail}
                </DsText>
                {showBackend && step.backend ? (
                  <DsText
                    as="p"
                    role="meta"
                    className="rounded-ds-field-media bg-ds-neutral-subtle-default px-ds-8 py-ds-6 text-ds-ink-muted-default"
                  >
                    {step.backend}
                  </DsText>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-ds-10 border-x-0 border-b-0 border-t border-solid border-ds-hairline-subtle-default pt-ds-12">
        <DsText as="h3" role="base" weight="semibold">
          {t('geo.studio-clean-confirm-title', {
            defaultValue: '等你确认（{{count}}）',
            count: mockPendingFacts.length,
          })}
        </DsText>
        {mockPendingFacts.map((fact) => (
          <div
            key={fact.id}
            className="flex flex-col gap-ds-6 rounded-ds-card border-x border-y border border-solid border-ds-hairline-default-default p-ds-12"
          >
            <div className="flex items-start gap-ds-8">
              <Tag variant="primary" tone={GRADE_TONE[fact.grade]} size="sm">
                {fact.grade}
              </Tag>
              <DsText as="p" role="base" className="flex-1">
                {fact.question}
              </DsText>
            </div>
            <DsText as="span" role="meta" className="text-ds-ink-muted-default">
              {fact.source}
            </DsText>
            {fact.conflict ? (
              <Tag variant="outline" tone="error" size="xs">
                {fact.conflict}
              </Tag>
            ) : null}
            {fact.weak ? (
              <Tag variant="outline" tone="warning" size="xs">
                {t('geo.studio-clean-weak', {
                  defaultValue: '证据弱，写稿不建议引用',
                })}
              </Tag>
            ) : null}
            <div className="flex items-center gap-ds-6">
              <Button variant="primary" size="xs" onClick={() => toast.success(confirmLabel)}>
                {confirmLabel}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => toast.info(rejectLabel)}>
                {rejectLabel}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => toast.info(sourceLabel)}>
                {sourceLabel}
              </Button>
            </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => toast.success(batchCta)}>
          {batchCta}
        </Button>
      </div>

      <div className="flex flex-col gap-ds-4 border-x-0 border-b-0 border-t border-solid border-ds-hairline-subtle-default pt-ds-12">
        <DsText as="h3" role="base" weight="semibold">
          {t('geo.studio-clean-usage-title', { defaultValue: '本次用量' })}
        </DsText>
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          {mockCleaningUsage.chars} · {mockCleaningUsage.cacheHit}
        </DsText>
        <Tag variant="secondary" tone="information" size="xs">
          {t('geo.studio-clean-usage-cost', {
            defaultValue: '约 ¥{{cost}}',
            cost: '1.8',
          })}
        </Tag>
      </div>
    </div>
  );
}
