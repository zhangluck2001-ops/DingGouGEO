// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { TooltipSimple } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PanelRight, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChatMessage, ChatOption, StudioMode } from './mocks/mockData';
import {
  currentProduct,
  hasData,
  isAskingState,
  type StudioAction,
  type StudioState,
} from './studioState';

const MODE_LABEL_KEY: Record<StudioMode, string> = {
  data: 'studio-mode-data',
  run: 'studio-mode-run',
  diag: 'studio-mode-diag',
};

function decideMessages(state: StudioState): ChatMessage[] {
  if (isAskingState(state)) return state.onboardChat;
  const product = currentProduct(state);
  if (product && !product.hasData) {
    if (state.mode === 'diag') return state.onboardChat;
    return [];
  }
  return state.chatByMode[state.mode];
}

function OptionCard({
  option,
  onPick,
}: {
  option: ChatOption;
  onPick: (option: ChatOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      className={cn(
        'flex w-full flex-col items-start gap-ds-2 rounded-ds-field-media border-x border-y border border-solid px-ds-12 py-ds-8 text-left transition-colors',
        'border-ds-hairline-default-default hover:bg-ds-neutral-subtle-default',
        option.rec && 'border-ds-hairline-strong-default bg-ds-neutral-subtle-default',
      )}
    >
      {option.text ? (
        <DsText as="span" role="base" weight={option.rec ? 'semibold' : 'regular'}>
          {option.text}
        </DsText>
      ) : null}
      {option.sub ? (
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          {option.sub}
        </DsText>
      ) : null}
    </button>
  );
}

function MessageItem({
  message,
  onPickOption,
  noneLabel,
  todayLabel,
  whoLabel,
}: {
  message: ChatMessage;
  onPickOption: (option: ChatOption) => void;
  noneLabel: string;
  todayLabel: (date: string) => string;
  whoLabel: string;
}) {
  if (message.kind === 'date') {
    return (
      <div className="flex items-center justify-center">
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          — {todayLabel(message.date ?? '')} —
        </DsText>
      </div>
    );
  }
  if (message.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-ds-card rounded-br-ds-compact-control bg-ds-accent-strong-default px-ds-12 py-ds-8">
          <DsText as="span" role="base" className="text-ds-ink-inverse">
            {message.text}
          </DsText>
        </div>
      </div>
    );
  }
  // ai
  return (
    <div className="flex flex-col items-start gap-ds-6">
      <DsText as="span" role="meta" weight="semibold">
        {whoLabel}
      </DsText>
      <div className="flex w-full max-w-[88%] flex-col gap-ds-8 rounded-ds-card border-x border-y border border-solid border-ds-hairline-default-default bg-ds-neutral-default-default px-ds-12 py-ds-10">
        {message.text ? (
          <DsText as="p" role="base">
            {message.text}
          </DsText>
        ) : null}
        {message.steps?.length ? (
          <ul className="flex flex-col gap-ds-4">
            {message.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-ds-6">
                <DsText as="span" role="base" weight="semibold" className="shrink-0">
                  {step.symbol}
                </DsText>
                <DsText as="span" role="base">
                  {step.text}
                </DsText>
              </li>
            ))}
          </ul>
        ) : null}
        {message.options?.length ? (
          <div className="flex flex-col gap-ds-4">
            {message.options.map((opt, idx) => (
              <OptionCard key={idx} option={opt} onPick={onPickOption} />
            ))}
            <OptionCard
              option={{ text: '', sub: noneLabel }}
              onPick={() => {
                onPickOption({ text: '', sub: noneLabel });
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StudioChat({
  state,
  dispatch,
  showWorkPanel,
  onToggleWorkPanel,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
  showWorkPanel: boolean;
  onToggleWorkPanel: () => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const asking = isAskingState(state);
  const product = currentProduct(state);
  const dataReady = hasData(state);
  const messages = decideMessages(state);

  // Auto-scroll to the latest message on send, receive, or mode switch.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, state.mode, state.onboardStage]);

  useEffect(() => {
    if (state.pendingInput == null) return;
    setInput(state.pendingInput);
    dispatch({ type: 'CONSUME_PENDING_INPUT' });
    textareaRef.current?.focus();
  }, [state.pendingInput, dispatch]);

  const modeLabel = t(`geo.${MODE_LABEL_KEY[state.mode]}`, {
    defaultValue: state.mode,
  });
  const title = asking
    ? t('geo.studio-chat-title-asking', { defaultValue: '开始使用' })
    : t('geo.studio-chat-title', {
        defaultValue: '{{product}} · {{mode}}模式',
        product: product?.name ?? '',
        mode: modeLabel,
      });
  const permLabel = asking
    ? ''
    : state.mode === 'diag'
      ? t('geo.studio-chat-perm-diag', { defaultValue: '只读' })
      : t('geo.studio-chat-perm-other', { defaultValue: '可改' });

  const placeholderKey = asking
    ? 'studio-chat-input-placeholder-asking'
    : `studio-chat-input-placeholder-${state.mode}`;
  const placeholder = t(`geo.${placeholderKey}`, {
    defaultValue: '例如：全安素，一款给中老年和术后人群的营养粉',
  });
  const hintKey = asking
    ? 'studio-chat-hint-asking'
    : `studio-chat-hint-${state.mode}`;
  const hint = t(`geo.${hintKey}`, {
    defaultValue: '直接用一句话回答就行，助手会自己建档案、记下产品简介。',
  });
  const sendLabel = t('geo.studio-chat-send', { defaultValue: '发送' });
  const noneLabel = t('geo.studio-chat-opt-none', {
    defaultValue: '都不是，我自己说……',
  });
  const whoLabel = t('geo.studio-chat-who', { defaultValue: 'GEO 助手' });
  const todayLabel = (date: string) =>
    t('geo.studio-chat-day-today', {
      defaultValue: '今天 · {{date}}',
      date,
    });
  const toggleWorkPanelLabel = showWorkPanel
    ? t('geo.studio-chat-toggle-workpanel-hide', { defaultValue: '隐藏工作区' })
    : t('geo.studio-chat-toggle-workpanel-show', { defaultValue: '显示工作区' });

  const handlePickOption = (option: ChatOption) => {
    if (option.switch) {
      dispatch({ type: 'SET_MODE', mode: option.switch.mode });
      dispatch({ type: 'SET_TAB', mode: option.switch.mode, tab: option.switch.tab });
      return;
    }
    if (option.ask) {
      dispatch({ type: 'ASK_ASSISTANT', text: option.ask });
      return;
    }
    if (option.openCard) {
      dispatch({ type: 'OPEN_BRAND_CARD' });
      return;
    }
    if (option.skip) {
      dispatch({ type: 'SKIP_COMPETITORS' });
      return;
    }
    // 「都不是，我自己说……」 — focus the input
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (asking) {
      dispatch({ type: 'SUBMIT_PRODUCT_INTRO', raw: text });
    } else if (state.onboardStage === 'asking-competitors') {
      dispatch({ type: 'SUBMIT_COMPETITORS', raw: text });
    } else if (!dataReady && state.mode === 'diag') {
      dispatch({ type: 'APPEND_ONBOARD_USER_MESSAGE', text });
    } else {
      dispatch({ type: 'APPEND_USER_MESSAGE', mode: state.mode, text });
    }
    setInput('');
  };

  const inputDisabled = !asking && !dataReady && state.mode !== 'diag';

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex h-ds-layout-row-header shrink-0 items-center gap-ds-6 border-x-0 border-t-0 border-b border-solid border-ds-hairline-subtle-default px-ds-16">
        <DsText as="span" role="title" weight="semibold" className="truncate">
          {title}
        </DsText>
        {permLabel ? (
          <Tag
            variant="outline"
            tone={state.mode === 'diag' ? 'success' : 'warning'}
            size="xs"
          >
            {permLabel}
          </Tag>
        ) : null}
        <div className="ml-auto">
          <TooltipSimple content={toggleWorkPanelLabel} side="bottom" variant="instant">
            <Button
              variant="ghost"
              size="sm"
              buttonContent="icon-only"
              onClick={onToggleWorkPanel}
              aria-label={toggleWorkPanelLabel}
              aria-pressed={showWorkPanel}
            >
              <PanelRight aria-hidden />
            </Button>
          </TooltipSimple>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-ds-14 overflow-y-auto p-ds-20"
        aria-live="polite"
      >
        {messages.length === 0 && !asking && !dataReady ? (
          <EmptyChatHint state={state} />
        ) : (
          messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              onPickOption={handlePickOption}
              noneLabel={noneLabel}
              todayLabel={todayLabel}
              whoLabel={whoLabel}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 flex-col gap-ds-4 border-x-0 border-b-0 border-t border-solid border-ds-hairline-subtle-default p-ds-12">
        <Textarea
          ref={textareaRef}
          variant="none"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onEnter={handleSend}
          placeholder={placeholder}
          disabled={inputDisabled}
          className="min-h-[40px] resize-none rounded-ds-card bg-ds-neutral-subtle-default px-ds-12 py-ds-8 text-ds-text-base text-ds-ink-default-default placeholder:text-ds-ink-muted-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-ring-focus focus-visible:ring-offset-2"
          aria-label={title}
        />
        <div className="flex items-center justify-between gap-ds-8">
          <DsText as="span" role="meta" className="text-ds-ink-muted-default">
            {hint}
          </DsText>
          <Button variant="primary" size="sm" onClick={handleSend} disabled={inputDisabled}>
            <Send className="h-4 w-4" aria-hidden />
            {sendLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

function EmptyChatHint({ state }: { state: StudioState }) {
  const { t } = useTranslation();
  const product = currentProduct(state);
  if (state.mode === 'data') {
    const cta = t('geo.studio-chat-empty-data-cta', { defaultValue: '上传原件' });
    return (
      <div className="flex flex-col gap-ds-8 px-ds-12 py-ds-20 text-center">
        <DsText as="p" role="base" className="text-ds-ink-muted-default">
          {t('geo.studio-chat-empty-data', {
            defaultValue: '把「{{product}}」的原件拖进来，或点上传。清洗流程会在右侧展开。',
            product: product?.name ?? '',
          })}
        </DsText>
        <div>
          <Button variant="secondary" size="sm" disabled>
            {cta}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-ds-8 px-ds-12 py-ds-20 text-center">
      <DsText as="p" role="base" className="text-ds-ink-muted-default">
        {t('geo.studio-chat-empty-run', {
          defaultValue: '探针问题还没准备好。先到资料模式出题，再回来开始第一轮采集。',
        })}
      </DsText>
    </div>
  );
}
