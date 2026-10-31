// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { TooltipSimple } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Bookmark,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { FeedItem, FeedType } from './mocks/mockData';
import { currentProduct, type StudioAction, type StudioState } from './studioState';

const FEED_TYPE_KEY: Record<FeedType, string> = {
  competitor: 'studio-feed-type-competitor',
  policy: 'studio-feed-type-policy',
  ai: 'studio-feed-type-ai',
  brand: 'studio-feed-type-brand',
};

const FEED_TYPE_TONE: Record<FeedType, 'information' | 'warning' | 'neutral' | 'success'> = {
  competitor: 'information',
  policy: 'warning',
  ai: 'neutral',
  brand: 'success',
};

function FeedRow({
  item,
  dispatch,
}: {
  item: FeedItem;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const typeLabel = t(`geo.${FEED_TYPE_KEY[item.type]}`, {
    defaultValue: item.type,
  });
  const sampleLabel = t('geo.studio-feed-sample', { defaultValue: '示例' });
  const urgentLabel = t('geo.studio-feed-urgent', { defaultValue: '要紧' });
  const relLabel = t('geo.studio-feed-rel-label', {
    defaultValue: '跟你的关系',
  });
  const actUseful = t('geo.studio-feed-act-useful', { defaultValue: '有用' });
  const actAsk = t('geo.studio-feed-act-ask', { defaultValue: '问问助手' });
  const actSource = t('geo.studio-feed-act-source', {
    defaultValue: '看原文',
  });
  const actFavorite = t('geo.studio-feed-act-favorite', {
    defaultValue: '收藏',
  });
  const actHide = t('geo.studio-feed-act-hide', { defaultValue: '不相关' });
  const hideToast = t('geo.studio-feed-hide-toast', {
    defaultValue: '以后少推这类',
  });

  return (
    <article
      className={cn(
        'flex flex-col gap-ds-6 rounded-ds-card border-x border-y border border-solid border-ds-hairline-default-default bg-ds-neutral-default-default p-ds-12',
        item.id.includes('fresh') && 'border-ds-hairline-strong-default',
      )}
    >
      <div className="flex flex-wrap items-center gap-ds-4">
        <Tag variant="secondary" tone={FEED_TYPE_TONE[item.type]} size="xs">
          {typeLabel}
        </Tag>
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          {item.source} · {item.time}
        </DsText>
        {item.sample ? (
          <Tag variant="outline" tone="warning" size="xs">
            {sampleLabel}
          </Tag>
        ) : null}
        {item.urgent ? (
          <Tag variant="primary" tone="error" size="xs">
            {urgentLabel}
          </Tag>
        ) : null}
      </div>
      <DsText as="h3" role="base" weight="semibold">
        {item.title}
      </DsText>
      <DsText as="p" role="base" className="text-ds-ink-muted-default">
        {item.summary}
      </DsText>
      <DsText as="p" role="base">
        <DsText as="span" role="meta" className="text-ds-ink-muted-default">
          {relLabel}：
        </DsText>
        {item.relation}
      </DsText>
      <div className="flex flex-wrap items-center gap-ds-4">
        <TooltipSimple content={actUseful} variant="instant">
          <Button
            variant="ghost"
            size="xs"
            buttonContent="icon-only"
            onClick={() => toast.success(actUseful)}
            aria-label={actUseful}
          >
            <ThumbsUp aria-hidden />
          </Button>
        </TooltipSimple>
        {item.askPreset ? (
          <TooltipSimple content={actAsk} variant="instant">
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                dispatch({ type: 'ASK_ASSISTANT', text: item.askPreset ?? '' })
              }
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
              {actAsk}
            </Button>
          </TooltipSimple>
        ) : null}
        <TooltipSimple content={actSource} variant="instant">
          <Button
            variant="ghost"
            size="xs"
            buttonContent="icon-only"
            onClick={() => toast.info(actSource)}
            aria-label={actSource}
          >
            <ExternalLink aria-hidden />
          </Button>
        </TooltipSimple>
        <TooltipSimple content={actFavorite} variant="instant">
          <Button
            variant="ghost"
            size="xs"
            buttonContent="icon-only"
            onClick={() => toast.success(actFavorite)}
            aria-label={actFavorite}
          >
            <Bookmark aria-hidden />
          </Button>
        </TooltipSimple>
        <TooltipSimple content={actHide} variant="instant">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              dispatch({ type: 'HIDE_FEED_ITEM', id: item.id });
              toast.info(hideToast);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
            {actHide}
          </Button>
        </TooltipSimple>
      </div>
    </article>
  );
}

export function FeedPanel({
  state,
  dispatch,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const product = currentProduct(state);
  const [focusInput, setFocusInput] = useState('');

  const title = t('geo.studio-feed-title', {
    defaultValue: '为「{{product}}」收集',
    product: product?.name ?? '',
  });
  const updateChip = t('geo.studio-feed-update-chip', {
    defaultValue: '每 6 小时自动更新',
  });
  const lastUpdate = t('geo.studio-feed-last-update', {
    defaultValue: '上次 {{when}}',
    when: '10 分钟前',
  });
  const refreshLabel = t('geo.studio-feed-refresh', { defaultValue: '刷新' });
  const focusLabel = t('geo.studio-feed-focus', { defaultValue: '关注范围' });
  const focusPlaceholder = t('geo.studio-feed-input-placeholder', {
    defaultValue: '告诉助手想多看或少看什么',
  });
  const focusSubmitLabel = t('geo.studio-feed-focus-submit', {
    defaultValue: '提交',
  });
  const freqLabel = t('geo.studio-feed-focus-frequency', {
    defaultValue: '提醒频率',
  });
  const freqLow = t('geo.studio-feed-freq-low', { defaultValue: '少' });
  const freqMedium = t('geo.studio-feed-freq-medium', { defaultValue: '适中' });
  const freqHigh = t('geo.studio-feed-freq-high', { defaultValue: '多' });

  const visibleFeed = [...state.freshFeed, ...state.feed].filter(
    (item) => !state.hiddenFeedIds.includes(item.id),
  );

  const handleFocusSubmit = () => {
    const text = focusInput.trim();
    if (!text) return;
    dispatch({ type: 'ADD_FOCUS_TAG', text });
    setFocusInput('');
  };

  return (
    <div className="flex flex-col gap-ds-12 p-ds-16">
      <div className="flex flex-wrap items-center justify-between gap-ds-6">
        <DsText as="h2" role="body-large" weight="semibold">
          {title}
        </DsText>
        <div className="flex items-center gap-ds-4">
          <Tag variant="secondary" tone="information" size="xs">
            {updateChip}
          </Tag>
          <DsText as="span" role="meta" className="text-ds-ink-muted-default">
            {lastUpdate}
          </DsText>
          <TooltipSimple content={refreshLabel} variant="instant">
            <Button
              variant="ghost"
              size="xs"
              buttonContent="icon-only"
              onClick={() => toast.success(refreshLabel)}
              aria-label={refreshLabel}
            >
              <RefreshCw aria-hidden />
            </Button>
          </TooltipSimple>
        </div>
      </div>

      <div className="flex flex-col gap-ds-8 rounded-ds-card border-x border-y border border-solid border-ds-hairline-subtle-default p-ds-12">
        <DsText as="span" role="meta" weight="semibold">
          {focusLabel}
        </DsText>
        <div className="flex items-center gap-ds-6">
          <Input
            size="sm"
            value={focusInput}
            onChange={(e) => setFocusInput(e.target.value)}
            onEnter={handleFocusSubmit}
            placeholder={focusPlaceholder}
          />
          <Button variant="primary" size="sm" onClick={handleFocusSubmit}>
            {focusSubmitLabel}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-ds-4">
          {state.focusTags.map((tag) => (
            <Tag key={tag.id} variant="secondary" tone="neutral" size="sm">
              <span className="flex items-center gap-ds-4">
                {tag.text}
                {tag.removable ? (
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'REMOVE_FOCUS_TAG', id: tag.id })
                    }
                    aria-label="remove"
                    className="inline-flex"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </span>
            </Tag>
          ))}
        </div>
        <div className="flex items-center gap-ds-6">
          <DsText as="span" role="meta" className="text-ds-ink-muted-default">
            {freqLabel}
          </DsText>
          <Select
            value={state.focusFreq}
            onValueChange={(v) =>
              dispatch({
                type: 'SET_FOCUS_FREQ',
                freq: v as 'low' | 'medium' | 'high',
              })
            }
          >
            <SelectTrigger size="xs" wrapperClassName="w-[120px]" aria-label={freqLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="low">{freqLow}</SelectItem>
                <SelectItem value="medium">{freqMedium}</SelectItem>
                <SelectItem value="high">{freqHigh}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {state.focusNotice ? (
          <DsText as="span" role="meta" className="text-ds-ink-muted-default">
            {state.focusNotice}
          </DsText>
        ) : null}
      </div>

      <div className="flex flex-col gap-ds-10">
        {visibleFeed.map((item) => (
          <FeedRow key={item.id} item={item} dispatch={dispatch} />
        ))}
      </div>
    </div>
  );
}
