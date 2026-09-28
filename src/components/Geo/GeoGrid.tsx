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

import type { GeoRecord } from '@/api/geo';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, LoaderCircle, Maximize2 } from 'lucide-react';
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { fieldLabel, type GeoField } from './datasets';

const CHECK_COLUMN_WIDTH = 40;

export interface GeoSort {
  field: string;
  order: 'asc' | 'desc';
}

export function GeoCellValue({
  field,
  value,
}: {
  field: GeoField;
  value: unknown;
}) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-ds-ink-muted-default">—</span>;
  }
  const text = String(value);
  switch (field.type) {
    case 'url':
      return (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          title={text}
          onClick={(event) => event.stopPropagation()}
          className="text-ds-ink-default-default underline decoration-ds-hairline-default-default underline-offset-2 hover:decoration-current"
        >
          {text.replace(/^https?:\/\//, '')}
        </a>
      );
    case 'select':
      return (
        <Badge variant="secondary" size="xs" className="max-w-full truncate">
          {text}
        </Badge>
      );
    case 'count':
      return Number(value) > 0 ? (
        <span className="tabular-nums">{text}</span>
      ) : (
        <span className="text-ds-ink-muted-default">—</span>
      );
    case 'code':
      return <span className="tabular-nums">{text}</span>;
    default:
      return <span title={text}>{text}</span>;
  }
}

/**
 * Spreadsheet-style grid: row selection, sortable headers, drag-to-resize
 * columns, sticky header and first data column, and an expand-record button.
 */
export default function GeoGrid({
  fields,
  rows,
  loading,
  sort,
  onSortChange,
  onResize,
  selectedIds,
  onSelectedIdsChange,
  activeId,
  onOpen,
  caption,
}: {
  fields: GeoField[];
  rows: GeoRecord[];
  loading: boolean;
  sort: GeoSort;
  onSortChange: (sort: GeoSort) => void;
  onResize: (key: string, width: number) => void;
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  activeId: number | null;
  onOpen: (row: GeoRecord) => void;
  caption: string;
}) {
  const { t } = useTranslation();
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});
  const resizing = useRef(false);

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someSelected = rows.some((row) => selectedIds.has(row.id));

  const toggleAll = () => {
    const next = new Set(selectedIds);
    rows.forEach((row) =>
      allSelected ? next.delete(row.id) : next.add(row.id)
    );
    onSelectedIdsChange(next);
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const cycleSort = (field: GeoField) => {
    if (resizing.current) return;
    if (sort.field !== field.key)
      onSortChange({ field: field.key, order: 'desc' });
    else
      onSortChange({
        field: field.key,
        order: sort.order === 'desc' ? 'asc' : 'desc',
      });
  };

  const startResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    field: GeoField
  ) => {
    event.preventDefault();
    event.stopPropagation();
    resizing.current = true;
    const startX = event.clientX;
    const startWidth = liveWidths[field.key] ?? field.width;
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => {
      latest = Math.max(56, startWidth + moveEvent.clientX - startX);
      setLiveWidths((current) => ({ ...current, [field.key]: latest }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onResize(field.key, latest);
      setLiveWidths((current) => {
        const next = { ...current };
        delete next[field.key];
        return next;
      });
      // Let the click that ends a drag finish before sorting is allowed again.
      setTimeout(() => {
        resizing.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const widthOf = (field: GeoField) => liveWidths[field.key] ?? field.width;
  const tableWidth =
    CHECK_COLUMN_WIDTH + fields.reduce((sum, field) => sum + widthOf(field), 0);

  return (
    <div className="scrollbar-always-visible relative min-h-0 flex-1 overflow-auto">
      <table
        className="table-fixed border-separate border-spacing-0 text-ds-text-base"
        style={{ width: tableWidth }}
      >
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col style={{ width: CHECK_COLUMN_WIDTH }} />
          {fields.map((field) => (
            <col key={field.key} style={{ width: widthOf(field) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 h-9 border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default bg-ds-neutral-subtle-default px-ds-12"
            >
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? 'indeterminate' : false
                }
                onCheckedChange={toggleAll}
                aria-label={t('geo.select-page', {
                  defaultValue: 'Select all on this page',
                })}
              />
            </th>
            {fields.map((field, index) => {
              const label = fieldLabel(t, field);
              const sorted = sort.field === field.key;
              return (
                <th
                  key={field.key}
                  scope="col"
                  aria-sort={
                    sorted
                      ? sort.order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(
                    'sticky top-0 z-20 h-9 border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default bg-ds-neutral-subtle-default p-0 text-left font-medium',
                    index === 0 && 'left-10 z-30 border-y-0 border-r border-l-0'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort(field)}
                    className="flex h-9 w-full min-w-0 items-center gap-ds-4 px-ds-8 text-left text-ds-text-meta text-ds-ink-muted-default outline-none hover:text-ds-ink-default-default focus-visible:ring-2 focus-visible:ring-ds-ring-focus focus-visible:ring-inset"
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    {sorted ? (
                      sort.order === 'asc' ? (
                        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
                      )
                    ) : null}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t('geo.resize-column', {
                      defaultValue: 'Resize {{name}}',
                      name: label,
                    })}
                    onPointerDown={(event) => startResize(event, field)}
                    className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize after:absolute after:inset-y-2 after:left-1/2 after:w-px after:bg-ds-hairline-default-default after:opacity-0 hover:after:opacity-100"
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedIds.has(row.id);
            const active = activeId === row.id;
            const rowBg =
              active || selected
                ? 'bg-ds-neutral-muted-default'
                : 'bg-ds-neutral-subtle-default';
            return (
              <tr
                key={row.id}
                aria-selected={selected}
                onClick={() => onOpen(row)}
                className="group/row cursor-pointer"
              >
                <td
                  className={cn(
                    'sticky left-0 z-10 h-9 border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default px-ds-12 group-hover/row:bg-ds-neutral-muted-default',
                    rowBg
                  )}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleOne(row.id)}
                    aria-label={t('geo.select-row', {
                      defaultValue: 'Select row {{id}}',
                      id: row.id,
                    })}
                  />
                </td>
                {fields.map((field, index) => (
                  <td
                    key={field.key}
                    className={cn(
                      'h-9 truncate border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default px-ds-8 align-middle text-ds-ink-default-default group-hover/row:bg-ds-neutral-muted-default',
                      rowBg,
                      index === 0 &&
                        'sticky left-10 z-10 border-y-0 border-r border-l-0'
                    )}
                  >
                    {index === 0 ? (
                      <span className="flex min-w-0 items-center gap-ds-4">
                        <span className="min-w-0 flex-1 truncate">
                          <GeoCellValue field={field} value={row[field.key]} />
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(row);
                          }}
                          aria-label={t('geo.expand-record', {
                            defaultValue: 'Open record',
                          })}
                          className="shrink-0 rounded-ds-compact-control p-ds-2 text-ds-ink-muted-default opacity-0 outline-none group-hover/row:opacity-100 hover:text-ds-ink-default-default focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ds-ring-focus"
                        >
                          <Maximize2 className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ) : (
                      <GeoCellValue field={field} value={row[field.key]} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <LoaderCircle
            className="h-5 w-5 animate-spin text-ds-ink-muted-default"
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}
