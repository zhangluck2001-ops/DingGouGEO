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

import {
  geoApi,
  type GeoFacetValue,
  type GeoLinkedCitation,
  type GeoRecord,
} from '@/api/geo';
import AlertDialog from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DsText } from '@/components/ui/ds-text';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { fieldLabel, recordTitle, type GeoDatasetConfig } from './datasets';

type Values = Record<string, string>;

function toValues(config: GeoDatasetConfig, record: GeoRecord | null): Values {
  return Object.fromEntries(
    config.fields
      .filter((field) => !field.readOnly)
      .map((field) => [
        field.key,
        record?.[field.key] == null ? '' : String(record[field.key]),
      ])
  );
}

/**
 * Expanded record: every field as a form, linked sources below. The same
 * panel creates a new record when `recordId` is `'new'`.
 */
export default function GeoRecordPanel({
  config,
  projectId,
  recordId,
  facets,
  initialValues,
  onClose,
  onSaved,
  onDeleted,
  onAskAi,
}: {
  config: GeoDatasetConfig;
  projectId: number;
  recordId: number | 'new';
  facets: Record<string, GeoFacetValue[]>;
  initialValues?: Values;
  onClose: () => void;
  onSaved: (record: GeoRecord) => void;
  onDeleted: (id: number) => void;
  onAskAi: (record: GeoRecord) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const isNew = recordId === 'new';
  const [record, setRecord] = useState<GeoRecord | null>(null);
  const [values, setValues] = useState<Values>(() => ({
    ...toValues(config, null),
    ...initialValues,
  }));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) {
      setRecord(null);
      setValues({ ...toValues(config, null), ...initialValues });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void geoApi
      .get(config.key, recordId, projectId)
      .then((response) => {
        if (cancelled) return;
        setRecord(response);
        setValues(toValues(config, response));
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // initialValues only seeds a new record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isNew, projectId, recordId]);

  const original = useMemo(() => toValues(config, record), [config, record]);
  const changed = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(values).filter(
          ([key, value]) => value !== (original[key] ?? '')
        )
      ),
    [original, values]
  );
  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      const saved = isNew
        ? await geoApi.create(config.key, projectId, values)
        : await geoApi.update(config.key, recordId, changed, projectId);
      setRecord(saved);
      setValues(toValues(config, saved));
      onSaved(saved);
      toast.success(
        isNew
          ? t('geo.record-created', { defaultValue: 'Record added' })
          : t('geo.record-saved', { defaultValue: 'Changes saved' })
      );
    } catch (error) {
      toast.error(
        t('geo.record-save-failed', {
          defaultValue: "Couldn't save. Try again.",
        }),
        { description: error instanceof Error ? error.message : undefined }
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    try {
      await geoApi.remove(config.key, [recordId], projectId);
      onDeleted(recordId);
      toast.success(
        t('geo.records-deleted', {
          defaultValue: '{{count}} deleted',
          count: 1,
        })
      );
    } catch (error) {
      toast.error(
        t('geo.record-delete-failed', {
          defaultValue: "Couldn't delete. Try again.",
        }),
        { description: error instanceof Error ? error.message : undefined }
      );
    }
  };

  const heading = isNew
    ? t('geo.new-record', { defaultValue: 'New record' })
    : record
      ? recordTitle(config, record)
      : t('geo.record', { defaultValue: 'Record' });
  const citations = (record?.citations ?? []) as GeoLinkedCitation[];

  return (
    <aside
      aria-label={heading}
      className={cn(
        'absolute inset-0 z-40 flex min-h-0 flex-col bg-ds-neutral-subtle-default',
        '@4xl:static @4xl:z-auto @4xl:w-[min(420px,42%)] @4xl:shrink-0 @4xl:border-y-0 @4xl:border-r-0 @4xl:border-l @4xl:border-solid @4xl:border-ds-hairline-default-default'
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-ds-8 border-x-0 border-t-0 border-b border-solid border-ds-hairline-default-default px-ds-12">
        <DsText
          as="h2"
          role="base"
          weight="semibold"
          className="min-w-0 flex-1 truncate"
          title={heading}
        >
          {heading}
        </DsText>
        {record?.local_edited ? (
          <Badge variant="secondary" size="xs">
            {t('geo.locally-edited', { defaultValue: 'Edited locally' })}
          </Badge>
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          buttonContent="icon-only"
          onClick={onClose}
          aria-label={t('layout.close', { defaultValue: 'Close' })}
        >
          <X aria-hidden />
        </Button>
      </div>

      {loading ? (
        <div role="status" className="flex flex-1 items-center justify-center">
          <LoaderCircle
            className="h-5 w-5 animate-spin text-ds-ink-muted-default"
            aria-hidden
          />
        </div>
      ) : !isNew && !record ? (
        <DsText
          as="p"
          role="base"
          className="p-ds-16 text-ds-ink-muted-default"
        >
          {t('geo.load-failed', { defaultValue: "Couldn't load this record." })}
        </DsText>
      ) : (
        <>
          <form
            className="scrollbar-always-visible flex min-h-0 flex-1 flex-col gap-ds-12 overflow-y-auto p-ds-16"
            onSubmit={(event) => {
              event.preventDefault();
              if (dirty || isNew) void save();
            }}
          >
            {config.fields.map((field) => {
              const label = fieldLabel(t, field);
              if (field.readOnly) {
                return isNew ? null : (
                  <div
                    key={field.key}
                    className="flex items-center justify-between gap-ds-8"
                  >
                    <DsText
                      as="span"
                      role="meta"
                      className="text-ds-ink-muted-default"
                    >
                      {label}
                    </DsText>
                    <DsText as="span" role="base" className="tabular-nums">
                      {String(record?.[field.key] ?? 0)}
                    </DsText>
                  </div>
                );
              }
              if (field.type === 'longtext') {
                return (
                  <Textarea
                    key={field.key}
                    variant="outlined"
                    size="sm"
                    title={label}
                    value={values[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className={
                      field.key === 'answer' ? 'min-h-[240px]' : undefined
                    }
                  />
                );
              }
              const options = field.facet ? (facets[field.key] ?? []) : [];
              return (
                <div key={field.key}>
                  <Input
                    size="sm"
                    title={label}
                    value={values[field.key] ?? ''}
                    list={options.length ? `${listId}-${field.key}` : undefined}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                  {options.length ? (
                    <datalist id={`${listId}-${field.key}`}>
                      {options.map((option) => (
                        <option key={option.value} value={option.value} />
                      ))}
                    </datalist>
                  ) : null}
                </div>
              );
            })}

            {citations.length > 0 ? (
              <section className="flex flex-col gap-ds-6 pt-ds-4">
                <DsText
                  as="h3"
                  role="meta"
                  weight="semibold"
                  className="text-ds-ink-muted-default"
                >
                  {t('geo.cited-sources', {
                    defaultValue: 'Sources ({{count}})',
                    count: citations.length,
                  })}
                </DsText>
                <ol className="m-0 flex list-none flex-col gap-ds-8 p-0">
                  {citations.map((citation, index) => (
                    <li key={citation.id} className="flex min-w-0 gap-ds-8">
                      <DsText
                        as="span"
                        role="meta"
                        className="w-5 shrink-0 text-right text-ds-ink-muted-default tabular-nums"
                      >
                        {index + 1}
                      </DsText>
                      <div className="flex min-w-0 flex-col">
                        {citation.url ? (
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-ds-text-base text-ds-ink-default-default hover:underline"
                            title={citation.title ?? citation.url}
                          >
                            {citation.title || citation.url}
                          </a>
                        ) : (
                          <DsText as="span" role="base" className="truncate">
                            {citation.title || '—'}
                          </DsText>
                        )}
                        <DsText
                          as="span"
                          role="meta"
                          className="truncate text-ds-ink-muted-default"
                        >
                          {[
                            citation.ai_platform,
                            citation.probe_code,
                            citation.source_platform,
                            citation.source_type,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </DsText>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </form>

          <div className="flex h-12 shrink-0 items-center gap-ds-8 border-x-0 border-t border-b-0 border-solid border-ds-hairline-default-default px-ds-12">
            {!isNew && record ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  buttonContent="icon-only"
                  tone="error"
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('geo.delete-record', {
                    defaultValue: 'Delete record',
                  })}
                >
                  <Trash2 aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onAskAi(record)}
                >
                  <Sparkles aria-hidden />
                  {t('geo.ask-ai', { defaultValue: 'Ask AI' })}
                </Button>
              </>
            ) : null}
            <div className="ml-auto flex items-center gap-ds-8">
              {dirty && !isNew ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setValues(original)}
                >
                  {t('geo.discard', { defaultValue: 'Discard' })}
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={saving || (!isNew && !dirty)}
                onClick={() => void save()}
              >
                {isNew
                  ? t('geo.add-record', { defaultValue: 'Add record' })
                  : t('geo.save', { defaultValue: 'Save' })}
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        title={t('geo.delete-confirm-title', {
          defaultValue: 'Delete {{count}} records?',
          count: 1,
        })}
        message={t('geo.delete-confirm-desc', {
          defaultValue:
            'They are removed from the local board. Syncing from Feishu won’t bring them back.',
        })}
        confirmText={t('geo.delete', { defaultValue: 'Delete' })}
        cancelText={t('layout.cancel')}
        confirmVariant="primary"
        confirmTone="error"
      />
    </aside>
  );
}
