// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { TooltipSimple } from '@/components/ui/tooltip';
import { Award, Plus, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  currentProduct,
  isAskingState,
  type StudioAction,
  type StudioState,
} from './studioState';

const NEW_PRODUCT_VALUE = '__new__';

export function StudioTopBar({
  state,
  dispatch,
}: {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
}) {
  const { t } = useTranslation();
  const product = currentProduct(state);
  const asking = isAskingState(state);
  const productLabel = t('geo.studio-top-product-label', {
    defaultValue: '产品',
  });
  const newProductLabel = t('geo.studio-top-new-product', {
    defaultValue: '＋新建产品档案',
  });
  const brandCardLabel = t('geo.studio-top-brand-card', {
    defaultValue: '品牌名片',
  });
  const noProductLabel = t('geo.studio-top-no-product', {
    defaultValue: '还没有产品',
  });
  const productTooltip = t('geo.studio-top-product-tooltip', {
    defaultValue: '一个产品一个档案，资料互不相通',
  });
  const previewTag = t('geo.studio-top-preview-tag', {
    defaultValue: '原型·示例数据',
  });
  const demoFirstLabel = t('geo.studio-top-demo-first', {
    defaultValue: '演示：首次打开',
  });
  const collectingLabel = t('geo.studio-top-collecting', {
    defaultValue: '采集中',
  });
  const roundChip = product
    ? t('geo.studio-top-round-chip', {
        defaultValue: '第 {{round}} 轮 · {{status}}',
        round: product.round,
        status: collectingLabel,
      })
    : '';

  return (
    <div className="flex h-ds-layout-row-header shrink-0 items-center gap-ds-8 border-x-0 border-t-0 border-b border-solid border-ds-hairline-subtle-default px-ds-12">
      <DsText
        as="span"
        role="title"
        weight="bold"
        className="text-ds-ink-default-default"
      >
        DingGouGEO
      </DsText>
      <TooltipSimple content={productTooltip} side="bottom" variant="instant">
        <div className="flex items-center gap-ds-4">
          <DsText as="span" role="meta" className="text-ds-ink-muted-default">
            {productLabel}
          </DsText>
          <Select
            value={asking ? '' : (state.currentProductId ?? '')}
            onValueChange={(value) => {
              if (value === NEW_PRODUCT_VALUE) {
                dispatch({ type: 'NEW_PRODUCT_FROM_SELECTOR' });
              } else {
                dispatch({ type: 'SWITCH_PRODUCT', productId: value });
              }
            }}
          >
            <SelectTrigger
              size="sm"
              wrapperClassName="w-[180px]"
              aria-label={productLabel}
            >
              <SelectValue placeholder={noProductLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {state.products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value={NEW_PRODUCT_VALUE}>
                <span className="flex items-center gap-ds-4">
                  <Plus className="h-4 w-4" aria-hidden />
                  {newProductLabel}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TooltipSimple>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => dispatch({ type: 'OPEN_BRAND_CARD' })}
        aria-label={brandCardLabel}
      >
        <Award aria-hidden />
        {brandCardLabel}
      </Button>
      {product && product.round > 0 ? (
        <Tag variant="secondary" tone="information" size="sm">
          {roundChip}
        </Tag>
      ) : null}
      <div className="ml-auto flex items-center gap-ds-6">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => dispatch({ type: 'RESET_TO_EMPTY' })}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {demoFirstLabel}
        </Button>
        <Tag variant="outline" tone="warning" size="sm">
          {previewTag}
        </Tag>
      </div>
    </div>
  );
}
