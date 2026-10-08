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

import GeoAgentsSettings from '@/components/Settings/SubAgents';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const agents = vi.hoisted(() => vi.fn());

vi.mock('@/api/geo', () => ({ geoApi: { agents } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

const roster = {
  root: { name: 'GEO Agent', tools: ['memory', 'agent'] },
  stages: [
    {
      seq: 3,
      key: 'capture',
      name: 'AI 采集',
      folder: '03_AI采集',
      duty: '负责建轮次、查进度',
      writes: '表 `geo_answer`',
      subagent_type: 'geo-capture',
      skills: ['doubao-capture'],
    },
    {
      seq: 4,
      key: 'analysis',
      name: '诊断分析',
      folder: '04_诊断分析',
      duty: '逐条读回答',
      writes: '表 `geo_answer_analysis`',
      subagent_type: 'geo-analysis',
      skills: [],
    },
  ],
};

describe('GeoAgentsSettings', () => {
  beforeEach(() => {
    agents.mockReset();
  });

  it('shows the GEO Agent and one agent per stage with its skills', async () => {
    agents.mockResolvedValue(roster);
    render(<GeoAgentsSettings />);

    expect(await screen.findByText('GEO Agent')).toBeInTheDocument();
    // Tool groups are labelled through i18n (the mock falls back to the key).
    expect(screen.getByText('memory')).toBeInTheDocument();
    expect(screen.getByText('agent')).toBeInTheDocument();
    expect(screen.getByText('3 AI 采集')).toBeInTheDocument();
    expect(screen.getByText('geo-capture')).toBeInTheDocument();
    // Prompt-style code marks are not shown to the user.
    expect(screen.getByText('表 geo_answer')).toBeInTheDocument();
    expect(screen.getByText('doubao-capture')).toBeInTheDocument();
    // A stage without skills says so instead of looking finished.
    expect(screen.getByText('Not set up')).toBeInTheDocument();
  });

  it('says so when the roster cannot be loaded', async () => {
    agents.mockRejectedValue(new Error('backend down'));
    render(<GeoAgentsSettings />);

    expect(
      await screen.findByText(
        'Could not load the agents. Check that the backend is running.'
      )
    ).toBeInTheDocument();
  });
});
