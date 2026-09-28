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
  type GeoImportRun,
  type GeoProject,
} from '@/api/geo';
import { Button } from '@/components/ui/button';
import { DsIcon } from '@/components/ui/ds-icon';
import { DsText } from '@/components/ui/ds-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TooltipSimple } from '@/components/ui/tooltip';
import { useSpaceStore } from '@/store/spaceStore';
import { useWorkbenchStore } from '@/store/workbenchStore';
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export const GEO_ALL = '__all__';
export const GEO_PAGE_SIZE = 50;

/**
 * Loads local GEO projects. The active Space's own project is the default;
 * picking another project is remembered per Space.
 */
const chosenBySpace = new Map<string, number>();

export function useGeoProjects(refreshKey = 0) {
  const activeSpaceId = useSpaceStore((state) => state.activeSpaceId);
  const version = useWorkbenchStore((state) => state.geoProjectsVersion);
  const [projects, setProjects] = useState<GeoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectIdState] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    geoApi
      .projects()
      .then((response) => {
        if (cancelled) return;
        const items = response?.items ?? [];
        setProjects(items);
        setError(null);
        const chosen = activeSpaceId
          ? chosenBySpace.get(activeSpaceId)
          : undefined;
        const own = items.find((item) => item.space_id === activeSpaceId);
        const next =
          (chosen && items.some((item) => item.id === chosen)
            ? chosen
            : undefined) ??
          own?.id ??
          items[0]?.id ??
          null;
        setProjectIdState(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, version, activeSpaceId]);

  const setProjectId = useCallback(
    (id: number) => {
      if (activeSpaceId) chosenBySpace.set(activeSpaceId, id);
      setProjectIdState(id);
    },
    [activeSpaceId]
  );

  return { projects, projectId, setProjectId, loading, error };
}

export function GeoProjectSelect({
  projects,
  value,
  onChange,
}: {
  projects: GeoProject[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const { t } = useTranslation();
  if (projects.length === 0) return null;
  return (
    <Select
      value={value == null ? undefined : String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger
        size="xs"
        aria-label={t('geo.project', { defaultValue: 'Project' })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={String(project.id)}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GeoFacetSelect({
  label,
  allLabel,
  values,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  values: GeoFacetValue[] | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value || GEO_ALL}
      onValueChange={(next) => onChange(next === GEO_ALL ? '' : next)}
    >
      <SelectTrigger size="xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={GEO_ALL}>{allLabel}</SelectItem>
        {(values ?? []).map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.value} · {item.count.toLocaleString()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Starts a Feishu → local import and polls until it finishes. */
export function GeoSyncButton({ onFinished }: { onFinished: () => void }) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(() => {
    stopPolling();
    timer.current = setInterval(() => {
      void geoApi
        .importStatus()
        .then((status) => {
          if (status.running) return;
          stopPolling();
          setRunning(false);
          const failed = status.runs.filter(
            (run: GeoImportRun) => run.status === 'error'
          );
          if (failed.length > 0) {
            toast.error(
              t('geo.sync-failed', {
                defaultValue: 'Some tables failed to sync',
              })
            );
          } else {
            toast.success(t('geo.sync-done', { defaultValue: 'Synced' }));
          }
          onFinished();
        })
        .catch(() => undefined);
    }, 3000);
  }, [onFinished, stopPolling, t]);

  useEffect(() => {
    void geoApi
      .importStatus()
      .then((status) => {
        if (status.running) {
          setRunning(true);
          poll();
        }
      })
      .catch(() => undefined);
    return stopPolling;
  }, [poll, stopPolling]);

  const start = () => {
    setRunning(true);
    void geoApi
      .startImport()
      .then(() => poll())
      .catch(() => {
        setRunning(false);
        toast.error(
          t('geo.sync-failed', { defaultValue: 'Some tables failed to sync' })
        );
      });
  };

  const label = running
    ? t('geo.syncing', { defaultValue: 'Syncing…' })
    : t('geo.sync', { defaultValue: 'Sync from Feishu' });

  return (
    <TooltipSimple content={label}>
      <Button
        variant="secondary"
        size="sm"
        buttonRadius="full"
        buttonContent="icon-only"
        disabled={running}
        onClick={start}
        aria-label={label}
      >
        {running ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw aria-hidden />
        )}
      </Button>
    </TooltipSimple>
  );
}

export function GeoStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-ds-2 rounded-ds-card bg-ds-neutral-default-default px-ds-16 py-ds-12">
      <DsText as="span" role="meta" className="text-ds-ink-muted-default">
        {label}
      </DsText>
      <DsText as="span" role="title" weight="semibold">
        {value}
      </DsText>
    </div>
  );
}

export function GeoPager({
  page,
  total,
  pageSize = GEO_PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-ds-8 border-x-0 border-t border-b-0 border-solid border-ds-hairline-default-default px-ds-16">
      <DsText as="span" role="meta" className="text-ds-ink-muted-default">
        {t('geo.total-rows', {
          defaultValue: '{{count}} rows',
          count: total,
          formatted: total.toLocaleString(),
        })}
      </DsText>
      <div className="flex items-center gap-ds-4">
        <Button
          variant="ghost"
          size="xs"
          buttonContent="icon-only"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('geo.previous-page', { defaultValue: 'Previous page' })}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <DsText as="span" role="meta" className="tabular-nums">
          {page} / {pages}
        </DsText>
        <Button
          variant="ghost"
          size="xs"
          buttonContent="icon-only"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('geo.next-page', { defaultValue: 'Next page' })}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function GeoEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-ds-12 px-ds-24 text-center">
      <DsIcon
        icon={icon}
        recipe="detailed"
        className="text-ds-ink-muted-default"
      />
      <div className="flex flex-col gap-ds-4">
        <DsText as="h2" role="body-large" weight="semibold">
          {title}
        </DsText>
        <DsText as="p" role="base" className="text-ds-ink-muted-default">
          {description}
        </DsText>
      </div>
      {action}
    </div>
  );
}

/** Debounces free-text search so each keystroke doesn't hit SQLite. */
export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}
