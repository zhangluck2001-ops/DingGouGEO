// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

import { geoApi, type GeoRecord } from '@/api/geo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import { cn } from '@/lib/utils';
import { LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { recordTitle, type GeoDatasetConfig } from './datasets';

const CARDS_PER_COLUMN = 50;

interface Column {
  value: string;
  items: GeoRecord[];
  total: number;
}

/**
 * Board grouped by one select field (content status). Drag a card to
 * another column to change that field.
 */
export default function GeoKanban({
  config,
  projectId,
  groupValues,
  filters,
  query,
  refreshKey,
  activeId,
  onOpen,
  onCreate,
  onChanged,
}: {
  config: GeoDatasetConfig;
  projectId: number;
  groupValues: string[];
  filters: Record<string, string>;
  query: string;
  refreshKey: number;
  activeId: number | null;
  onOpen: (record: GeoRecord) => void;
  onCreate: (initial: Record<string, string>) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const groupField = config.kanbanField as string;
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const groupKey = groupValues.join('|');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all(
      groupValues.map((value) =>
        geoApi
          .list(config.key, {
            project_id: projectId,
            ...filters,
            [groupField]: value,
            q: query,
            sort: config.defaultSort.field,
            order: config.defaultSort.order,
            page_size: CARDS_PER_COLUMN,
          })
          .then((page) => ({ value, items: page.items, total: page.total }))
      )
    )
      .then((next) => {
        if (!cancelled) setColumns(next);
      })
      .catch(() => {
        if (!cancelled) setColumns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // groupKey stands in for groupValues' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, projectId, groupKey, JSON.stringify(filters), query, refreshKey]);

  const handleDrop = async (event: DragEvent<HTMLElement>, value: string) => {
    event.preventDefault();
    setDropTarget(null);
    const id = Number(event.dataTransfer.getData('text/plain'));
    const source = columns.find((column) =>
      column.items.some((item) => item.id === id)
    );
    if (!id || !source || source.value === value) return;
    const card = source.items.find((item) => item.id === id) as GeoRecord;
    setColumns((current) =>
      current.map((column) =>
        column.value === source.value
          ? {
              ...column,
              items: column.items.filter((item) => item.id !== id),
              total: column.total - 1,
            }
          : column.value === value
            ? {
                ...column,
                items: [{ ...card, [groupField]: value }, ...column.items],
                total: column.total + 1,
              }
            : column
      )
    );
    try {
      await geoApi.update(config.key, id, { [groupField]: value }, projectId);
      onChanged();
    } catch {
      toast.error(
        t('geo.record-save-failed', {
          defaultValue: "Couldn't save. Try again.",
        })
      );
      onChanged();
    }
  };

  if (loading && columns.length === 0) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <LoaderCircle
          className="h-5 w-5 animate-spin text-ds-ink-muted-default"
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="scrollbar-always-visible flex min-h-0 flex-1 gap-ds-12 overflow-x-auto p-ds-16">
      {columns.map((column) => (
        <section
          key={column.value}
          aria-label={column.value}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(column.value);
          }}
          onDragLeave={() =>
            setDropTarget((current) =>
              current === column.value ? null : current
            )
          }
          onDrop={(event) => void handleDrop(event, column.value)}
          className={cn(
            'flex min-h-0 w-[264px] shrink-0 flex-col rounded-ds-card bg-ds-neutral-default-default',
            dropTarget === column.value && 'ring-2 ring-ds-ring-focus'
          )}
        >
          <header className="flex h-10 shrink-0 items-center gap-ds-8 px-ds-12">
            <DsText as="h3" role="base" weight="semibold" className="truncate">
              {column.value}
            </DsText>
            <Badge variant="secondary" size="xs">
              {column.total.toLocaleString()}
            </Badge>
            <Button
              variant="ghost"
              size="xs"
              buttonContent="icon-only"
              className="ml-auto"
              onClick={() => onCreate({ [groupField]: column.value })}
              aria-label={t('geo.add-to-column', {
                defaultValue: 'Add to {{name}}',
                name: column.value,
              })}
            >
              <Plus aria-hidden />
            </Button>
          </header>
          <ol className="scrollbar-always-visible m-0 flex min-h-0 flex-1 list-none flex-col gap-ds-8 overflow-y-auto p-ds-8 pt-0">
            {column.items.map((item) => {
              const cited = Number(item.cited_count ?? 0);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', String(item.id));
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onOpen(item)}
                    className={cn(
                      'flex w-full flex-col gap-ds-6 rounded-ds-field bg-ds-neutral-subtle-default p-ds-12 text-left shadow-ds-elevation-control outline-none hover:shadow-ds-elevation-control-hover focus-visible:ring-2 focus-visible:ring-ds-ring-focus',
                      activeId === item.id && 'ring-2 ring-ds-ring-focus'
                    )}
                  >
                    <DsText
                      as="span"
                      role="base"
                      className="line-clamp-2 break-all"
                    >
                      {recordTitle(config, item)}
                    </DsText>
                    <span className="flex flex-wrap items-center gap-ds-4">
                      {item.account_platform ? (
                        <Badge variant="secondary" size="xs">
                          {String(item.account_platform)}
                        </Badge>
                      ) : null}
                      {cited > 0 ? (
                        <Badge variant="secondary" size="xs" tone="success">
                          {t('geo.cited-times', {
                            defaultValue: 'Cited {{count}}',
                            count: cited,
                          })}
                        </Badge>
                      ) : null}
                      {item.account_name ? (
                        <DsText
                          as="span"
                          role="meta"
                          className="truncate text-ds-ink-muted-default"
                        >
                          {String(item.account_name)}
                        </DsText>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {column.total > column.items.length ? (
              <DsText
                as="li"
                role="meta"
                className="px-ds-4 text-ds-ink-muted-default"
              >
                {t('geo.more-in-grid', {
                  defaultValue: '{{count}} more — use the grid to see all',
                  count: column.total - column.items.length,
                })}
              </DsText>
            ) : null}
          </ol>
        </section>
      ))}
    </div>
  );
}
