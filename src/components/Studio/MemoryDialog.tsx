// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogContentSection,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { DsText } from '@/components/ui/ds-text';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { TooltipSimple } from '@/components/ui/tooltip';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { MemoryItem, StudioMode } from './mocks/mockData';
import {
  currentMemories,
  currentProduct,
  type StudioAction,
  type StudioState,
} from './studioState';

const MODE_LABEL_KEY: Record<StudioMode, string> = {
  data: 'studio-mode-data',
  run: 'studio-mode-run',
  diag: 'studio-mode-diag',
};

function MemoryRow({
  memory,
  onRemove,
}: {
  memory: MemoryItem;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const kindLabel =
    memory.kind === 'rule'
      ? t('geo.studio-memory-kind-rule', { defaultValue: '规则' })
      : t('geo.studio-memory-kind-preference', { defaultValue: '偏好' });
  const source =
    memory.source === 'manual'
      ? t('geo.studio-memory-source-manual', { defaultValue: '你在清单里加的' })
      : t('geo.studio-memory-source-chat', {
          defaultValue: '{{mode}}模式 · {{date}} · 从聊天记下',
          mode: t(`geo.${MODE_LABEL_KEY[memory.source.mode]}`, {
            defaultValue: memory.source.mode,
          }),
          date: memory.source.date,
        });
  const removeLabel = t('geo.studio-memory-remove', {
    defaultValue: '删掉这条',
  });
  return (
    <li className="flex items-start gap-ds-8 rounded-ds-card border border-x border-y border-solid border-ds-hairline-subtle-default px-ds-12 py-ds-8">
      <div className="flex min-w-0 flex-1 flex-col gap-ds-2">
        <div className="flex items-center gap-ds-6">
          <Tag
            variant="outline"
            tone={memory.kind === 'rule' ? 'warning' : 'information'}
            size="xs"
          >
            {kindLabel}
          </Tag>
          <DsText as="span" role="base">
            {memory.text}
          </DsText>
        </div>
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          {source}
        </DsText>
      </div>
      <TooltipSimple content={removeLabel} variant="instant">
        <Button
          variant="ghost"
          size="xs"
          buttonContent="icon-only"
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <Trash2 aria-hidden />
        </Button>
      </TooltipSimple>
    </li>
  );
}

export function MemoryDialog({
  state,
  dispatch,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const product = currentProduct(state);
  const memories = currentMemories(state);
  const title = t('geo.studio-memory-title', {
    defaultValue: '助手记住的事 · {{product}}',
    product: product?.name ?? '',
  });
  const desc = t('geo.studio-memory-desc', {
    defaultValue:
      '助手每次回答前都会先读这份清单，三个模式共用。聊天里说过的规则，你同意后才会记进来；这里可以随时删掉或补一条。',
  });
  const emptyLabel = t('geo.studio-memory-empty', {
    defaultValue:
      '还没有记住的事。聊天时说「以后……」「别再……」，助手会问你要不要记下。',
  });
  const placeholder = t('geo.studio-memory-add-placeholder', {
    defaultValue: '例如：稿子里不提价格',
  });
  const addLabel = t('geo.studio-memory-add', { defaultValue: '加一条' });

  const handleAdd = () => {
    if (!draft.trim()) return;
    dispatch({ type: 'ADD_MEMORY', text: draft });
    setDraft('');
  };

  return (
    <Dialog
      open={state.memoryOpen}
      onOpenChange={(o) => !o && dispatch({ type: 'CLOSE_MEMORY' })}
    >
      <DialogContent size="md" overlayVariant="dimmed">
        <DialogHeader title={title} subtitle={desc} />
        <DialogContentSection className="flex flex-col gap-ds-12">
          {memories.length === 0 ? (
            <DsText as="p" role="base" className="text-ds-ink-muted-default">
              {emptyLabel}
            </DsText>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-ds-6 p-0">
              {memories.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  onRemove={() =>
                    dispatch({ type: 'REMOVE_MEMORY', id: memory.id })
                  }
                />
              ))}
            </ul>
          )}
          <div className="flex items-center gap-ds-6">
            <Input
              size="sm"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onEnter={handleAdd}
              placeholder={placeholder}
              aria-label={addLabel}
            />
            <Button variant="secondary" size="sm" onClick={handleAdd}>
              {addLabel}
            </Button>
          </div>
        </DialogContentSection>
        <DialogFooter
          showCancelButton
          onCancel={() => dispatch({ type: 'CLOSE_MEMORY' })}
        />
      </DialogContent>
    </Dialog>
  );
}
