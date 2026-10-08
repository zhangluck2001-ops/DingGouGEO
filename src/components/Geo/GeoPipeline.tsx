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

import { geoApi, type GeoPipeline, type GeoStageKey } from '@/api/geo';
import { Button } from '@/components/ui/button';
import { DsIcon } from '@/components/ui/ds-icon';
import { DsText } from '@/components/ui/ds-text';
import { Tag } from '@/components/ui/tag';
import type { SettingsSectionId } from '@/store/settingsStore';
import { Check, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpenGeoStage } from './navigation';

/** The page that works on each stage. Publishing and tracking share one. */
const STAGE_SECTION: Record<GeoStageKey, SettingsSectionId> = {
  knowledge: 'geo-knowledge',
  probes: 'geo-probes',
  capture: 'geo-answers',
  analysis: 'geo-analysis',
  citations: 'geo-citations',
  content: 'geo-drafts',
  publish: 'geo-published',
  tracking: 'geo-published',
};

/**
 * Where the Space stands on each pipeline stage: the completion checks the
 * backend runs against the stage's contract, and a way into the stage.
 */
export function GeoPipelineView({
  projectId,
  refreshKey,
}: {
  projectId: number;
  refreshKey: number;
}) {
  const { t } = useTranslation();
  const openStage = useOpenGeoStage();
  const [pipeline, setPipeline] = useState<GeoPipeline | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    geoApi
      .pipeline(projectId)
      .then((result) => {
        if (!cancelled) setPipeline(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  if (failed) {
    return (
      <DsText as="p" role="base" className="p-ds-16 text-ds-ink-muted-default">
        {t('geo.pipeline-load-failed', {
          defaultValue: "Couldn't load the pipeline status. Try again.",
        })}
      </DsText>
    );
  }
  if (!pipeline) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center">
        <DsIcon
          icon={LoaderCircle}
          recipe="main"
          className="animate-spin text-ds-ink-muted-default motion-reduce:animate-none"
        />
        <span className="sr-only">
          {t('geo.pipeline-loading', {
            defaultValue: 'Loading the pipeline status',
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="scrollbar-always-visible min-h-0 flex-1 overflow-y-auto p-ds-16">
      <ol className="m-0 flex list-none flex-col gap-ds-stack-related p-0">
        {pipeline.stages.map((stage) => {
          const done = stage.state === '已完成';
          return (
            <li
              key={stage.key}
              className="flex flex-col gap-ds-control-gap rounded-2xl bg-ds-neutral-default-default p-ds-card-inset"
            >
              <div className="flex flex-wrap items-center gap-ds-control-gap">
                <DsText as="h3" role="base" weight="semibold" className="m-0">
                  {`${stage.seq} ${stage.name}`}
                </DsText>
                <Tag
                  variant="secondary"
                  tone={done ? 'success' : 'neutral'}
                  emphasis="muted"
                  size="sm"
                >
                  {done
                    ? t('geo.pipeline-done', { defaultValue: 'Done' })
                    : t('geo.pipeline-not-done', { defaultValue: 'Not done' })}
                </Tag>
                <DsText
                  as="span"
                  role="meta"
                  className="text-ds-ink-muted-default"
                >
                  {t('geo.pipeline-passed', {
                    defaultValue: '{{passed}} of {{total}} checks met',
                    passed: stage.passed,
                    total: stage.checks.length,
                  })}
                </DsText>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => openStage(STAGE_SECTION[stage.key])}
                >
                  {t('geo.pipeline-open', { defaultValue: 'Open' })}
                </Button>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {stage.checks.map((check) => (
                  <li
                    key={check.label}
                    className="flex items-start gap-ds-control-gap"
                  >
                    <DsIcon
                      icon={check.ok ? Check : X}
                      recipe="main"
                      className={
                        check.ok
                          ? 'text-ds-text-success-strong-default'
                          : 'text-ds-ink-muted-default'
                      }
                    />
                    <DsText as="span" role="base">
                      <span className="sr-only">
                        {check.ok
                          ? t('geo.pipeline-check-met', {
                              defaultValue: 'Met:',
                            })
                          : t('geo.pipeline-check-unmet', {
                              defaultValue: 'Not met:',
                            })}
                      </span>
                      {check.label}
                      {check.detail ? (
                        <span className="text-ds-ink-muted-default">
                          {`（${check.detail}）`}
                        </span>
                      ) : null}
                    </DsText>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
