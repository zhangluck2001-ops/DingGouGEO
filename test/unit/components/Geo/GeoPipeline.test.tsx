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

import { GeoPipelineView } from '@/components/Geo/GeoPipeline';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pipeline: vi.fn(), openStage: vi.fn() }));

vi.mock('@/api/geo', () => ({ geoApi: { pipeline: mocks.pipeline } }));
vi.mock('@/components/Geo/navigation', () => ({
  useOpenGeoStage: () => mocks.openStage,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; passed?: number; total?: number }
    ) =>
      (options?.defaultValue ?? _key)
        .replace('{{passed}}', String(options?.passed))
        .replace('{{total}}', String(options?.total)),
  }),
}));

describe('GeoPipelineView', () => {
  it('shows each stage with its checks and opens the stage page', async () => {
    mocks.pipeline.mockResolvedValue({
      capture_round: '第二轮',
      batch: null,
      stages: [
        {
          key: 'knowledge',
          seq: 1,
          name: '品牌知识库',
          state: '未完成',
          passed: 1,
          checks: [
            {
              label: '原始资料都已清洗',
              ok: false,
              detail: '未清洗 5／共 5 份',
            },
            { label: '七个模块都已填写', ok: true, detail: '7／7' },
          ],
        },
        {
          key: 'tracking',
          seq: 8,
          name: '效果追踪',
          state: '已完成',
          passed: 1,
          checks: [{ label: '至少有两个采集轮次', ok: true, detail: '2 个' }],
        },
      ],
    });
    render(<GeoPipelineView projectId={2} refreshKey={0} />);

    expect(await screen.findByText('1 品牌知识库')).toBeInTheDocument();
    expect(screen.getByText('Not done')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 checks met')).toBeInTheDocument();
    expect(screen.getByText('（未清洗 5／共 5 份）')).toBeInTheDocument();
    // Met and unmet checks are told apart in words, not only by the icon.
    expect(screen.getAllByText('Not met:')).toHaveLength(1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1]);
    expect(mocks.openStage).toHaveBeenCalledWith('geo-published');
  });

  it('says so when the status cannot be loaded', async () => {
    mocks.pipeline.mockRejectedValue(new Error('down'));
    render(<GeoPipelineView projectId={2} refreshKey={0} />);
    expect(
      await screen.findByText("Couldn't load the pipeline status. Try again.")
    ).toBeInTheDocument();
  });
});
