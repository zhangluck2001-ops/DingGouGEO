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

import { geoApi, type GeoAgents } from '@/api/geo';
import { Tag } from '@/components/ui/tag';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsRow, SettingsRowGroup } from '../SettingsRowGroup';
import SettingsSectionLoading from '../SettingsSectionLoading';
import SettingsSectionPage from '../SettingsSectionPage';

/** Stage texts are written for the agent's prompt, with `code` marks. */
const plain = (text: string) => text.replace(/`/g, '');

/**
 * The agents of DingGouGEO: the GEO Agent the user talks to, and one agent
 * per pipeline stage that it hands batch work to. Read-only; the roster and
 * each stage's skills come from the backend's stage registry.
 */
export default function GeoAgentsSettings() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<GeoAgents | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    geoApi
      .agents()
      .then((result) => {
        if (!cancelled) setAgents(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <SettingsSectionPage>
        <SettingsRowGroup>
          <SettingsRow
            title={t('setting.sub-agents', { defaultValue: 'GEO agents' })}
            description={t('geo.agents-load-failed', {
              defaultValue:
                'Could not load the agents. Check that the backend is running.',
            })}
          />
        </SettingsRowGroup>
      </SettingsSectionPage>
    );
  }
  if (!agents) {
    return (
      <SettingsSectionLoading
        label={t('geo.agents-loading', { defaultValue: 'Loading agents' })}
      />
    );
  }

  const notSetUp = t('geo.agents-skills-empty', {
    defaultValue: 'Not set up',
  });
  return (
    <SettingsSectionPage>
      <SettingsRowGroup>
        <SettingsRow
          title={agents.root.name}
          description={t('geo.agents-root-desc', {
            defaultValue:
              "The only agent you talk to. It works out which stage of the pipeline a task belongs to, does it or hands it to that stage's agent, checks the result, writes it back to the Space, and reports.",
          })}
        >
          <ul
            aria-label={t('geo.agents-tools', { defaultValue: 'Tools' })}
            className="m-0 flex list-none flex-wrap gap-ds-control-gap p-0"
          >
            {agents.root.tools.map((tool) => (
              <li key={tool}>
                <Tag variant="secondary" emphasis="muted" size="sm">
                  {t(`geo.agents-tool-${tool}`, { defaultValue: tool })}
                </Tag>
              </li>
            ))}
          </ul>
        </SettingsRow>
      </SettingsRowGroup>

      <SettingsRowGroup>
        <SettingsRow
          title={t('geo.agents-stages-title', {
            defaultValue: 'Stage agents',
          })}
          description={t('geo.agents-stages-desc', {
            defaultValue:
              'One per stage. The GEO Agent hands each one the batch work of its stage and checks what it returns.',
          })}
        />
        {agents.stages.map((stage) => (
          <SettingsRow
            key={stage.key}
            title={`${stage.seq} ${stage.name}`}
            description={plain(stage.duty)}
            action={
              <Tag variant="secondary" emphasis="muted" size="sm">
                {stage.subagent_type}
              </Tag>
            }
          >
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-ds-control-gap gap-y-1 text-ds-text-meta text-ds-ink-muted-default">
              <dt>{t('geo.agents-inputs', { defaultValue: 'Input' })}</dt>
              <dd className="m-0">{plain(stage.inputs)}</dd>
              <dt>{t('geo.agents-writes', { defaultValue: 'Output' })}</dt>
              <dd className="m-0">{plain(stage.writes)}</dd>
              <dt>{t('geo.agents-done', { defaultValue: 'Done when' })}</dt>
              <dd className="m-0">{plain(stage.done)}</dd>
              <dt>{t('geo.agents-skills', { defaultValue: 'Skills' })}</dt>
              <dd className="m-0 flex flex-wrap gap-1">
                {stage.skills.length
                  ? stage.skills.map((skill) => (
                      <Tag
                        key={skill}
                        variant="secondary"
                        emphasis="muted"
                        size="xs"
                      >
                        {skill}
                      </Tag>
                    ))
                  : notSetUp}
              </dd>
            </dl>
          </SettingsRow>
        ))}
      </SettingsRowGroup>
    </SettingsSectionPage>
  );
}
