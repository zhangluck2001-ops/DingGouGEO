// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import {
  Dialog,
  DialogContent,
  DialogContentSection,
  DialogFooter,
  DialogHeader,
} from '@/components/ui/dialog';
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import { useTranslation } from 'react-i18next';

import { mockBrandCard } from './mocks/mockData';

export function BrandCardDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const title = t('geo.studio-card-title', { defaultValue: '品牌名片' });
  const desc = t('geo.studio-card-desc', {
    defaultValue:
      '固定三栏，所有产品档案自动带上。其他资料一律放进各自产品。',
  });
  const companyLabel = t('geo.studio-card-company', {
    defaultValue: '公司名称',
  });
  const certLabel = t('geo.studio-card-cert', { defaultValue: '资质证书' });
  const redlineLabel = t('geo.studio-card-redline', {
    defaultValue: '合规红线',
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md" overlayVariant="dimmed">
        <DialogHeader title={title} subtitle={desc} />
        <DialogContentSection className="flex flex-col gap-ds-12">
          <div className="flex flex-col gap-ds-4">
            <DsText as="span" role="meta" weight="semibold">
              {companyLabel}
            </DsText>
            <DsText as="p" role="base">
              {mockBrandCard.company}
            </DsText>
          </div>
          <div className="flex flex-col gap-ds-4">
            <DsText as="span" role="meta" weight="semibold">
              {certLabel}
            </DsText>
            <DsText as="p" role="base">
              {mockBrandCard.certs}
            </DsText>
          </div>
          <div className="flex flex-col gap-ds-4">
            <div className="flex items-center gap-ds-4">
              <DsText as="span" role="meta" weight="semibold">
                {redlineLabel}
              </DsText>
              <Tag variant="outline" tone="error" size="xs">
                14
              </Tag>
            </div>
            <DsText as="p" role="base">
              {mockBrandCard.redlines}
            </DsText>
          </div>
        </DialogContentSection>
        <DialogFooter showCancelButton onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
