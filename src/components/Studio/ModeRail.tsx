// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import {
  hasData,
  isAskingState,
  type StudioAction,
  type StudioMode,
  type StudioState,
} from './studioState';

interface RingDef {
  ringKey: string;
  status: 'done' | 'doing' | 'todo';
}

interface ModeDef {
  mode: StudioMode;
  labelKey: string;
  subKey: string;
  permKey: string;
  rings: RingDef[];
}

const MODE_DEFS: ModeDef[] = [
  {
    mode: 'data',
    labelKey: 'studio-mode-data',
    subKey: 'studio-mode-data-sub',
    permKey: 'studio-mode-data-perm',
    rings: [
      { ringKey: 'studio-mode-ring-cleaning', status: 'doing' },
      { ringKey: 'studio-mode-ring-probes', status: 'done' },
      { ringKey: 'studio-mode-ring-write', status: 'todo' },
    ],
  },
  {
    mode: 'run',
    labelKey: 'studio-mode-run',
    subKey: 'studio-mode-run-sub',
    permKey: 'studio-mode-run-perm',
    rings: [
      { ringKey: 'studio-mode-ring-capture', status: 'doing' },
      { ringKey: 'studio-mode-ring-publish', status: 'todo' },
    ],
  },
  {
    mode: 'diag',
    labelKey: 'studio-mode-diag',
    subKey: 'studio-mode-diag-sub',
    permKey: 'studio-mode-diag-perm',
    rings: [
      { ringKey: 'studio-mode-ring-diag', status: 'done' },
      { ringKey: 'studio-mode-ring-citations', status: 'done' },
      { ringKey: 'studio-mode-ring-tracking', status: 'todo' },
    ],
  },
];

function ringDotClass(status: RingDef['status'] | null): string {
  if (!status) return 'bg-ds-neutral-muted-default';
  if (status === 'done') return 'bg-ds-bg-success-strong-default';
  if (status === 'doing') return 'bg-ds-bg-warning-strong-default';
  return 'bg-ds-neutral-muted-default';
}

export function ModeRail({
  state,
  dispatch,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const asking = isAskingState(state);
  const dataReady = hasData(state);
  const defaultLabel = t('geo.studio-mode-default', { defaultValue: '默认' });
  const footnote = t('geo.studio-mode-footnote', {
    defaultValue: '每个模式各记各的对话，切换时只带进度摘要。',
  });

  return (
    <nav className="flex w-[232px] shrink-0 flex-col gap-ds-4 overflow-y-auto border-y-0 border-r border-l-0 border-solid border-ds-hairline-subtle-default p-ds-12">
      {MODE_DEFS.map((def) => {
        const selected = state.mode === def.mode;
        const disabled = asking && def.mode !== 'diag';
        const label = t(`geo.${def.labelKey}`, { defaultValue: def.mode });
        const sub = t(`geo.${def.subKey}`, { defaultValue: '' });
        const perm = t(`geo.${def.permKey}`, { defaultValue: '' });
        return (
          <button
            key={def.mode}
            type="button"
            disabled={disabled}
            onClick={() => dispatch({ type: 'SET_MODE', mode: def.mode })}
            className={cn(
              'flex min-w-0 flex-col gap-ds-4 rounded-ds-card p-ds-12 text-left transition-colors',
              'hover:bg-ds-neutral-subtle-default',
              selected &&
                'bg-ds-neutral-default-default shadow-ds-elevation-card',
              disabled && 'pointer-events-none opacity-45'
            )}
            aria-current={selected ? 'true' : undefined}
          >
            <div className="flex items-center gap-ds-4">
              <DsText as="span" role="body-large" weight="semibold">
                {label}
              </DsText>
              {def.mode === 'diag' ? (
                <Tag variant="outline" tone="information" size="xs">
                  {defaultLabel}
                </Tag>
              ) : null}
            </div>
            <DsText as="span" role="meta" className="text-ds-ink-muted-default">
              {sub}
            </DsText>
            {selected ? (
              <div className="flex flex-col gap-ds-4">
                <div className="flex flex-col gap-ds-6">
                  {def.rings.map((ring) => {
                    const ringLabel = t(`geo.${ring.ringKey}`, {
                      defaultValue: ring.ringKey,
                    });
                    const effectiveStatus = dataReady ? ring.status : null;
                    return (
                      <div
                        key={ring.ringKey}
                        className="flex items-center gap-ds-6"
                      >
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            ringDotClass(effectiveStatus)
                          )}
                          aria-hidden
                        />
                        <DsText as="span" role="base">
                          {ringLabel}
                        </DsText>
                      </div>
                    );
                  })}
                </div>
                <DsText
                  as="span"
                  role="meta"
                  className="rounded-ds-field-media bg-ds-neutral-subtle-default px-ds-8 py-ds-6 text-ds-ink-muted-default"
                >
                  {perm}
                </DsText>
              </div>
            ) : null}
          </button>
        );
      })}
      <DsText
        as="span"
        role="meta"
        className="mt-auto text-ds-ink-muted-default"
      >
        {footnote}
      </DsText>
    </nav>
  );
}
