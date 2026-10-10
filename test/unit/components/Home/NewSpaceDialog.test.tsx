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

import NewSpaceDialog from '@/components/Home/NewSpaceDialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function renderDialog(onStartFromScratch = vi.fn(async () => true)) {
  const onOpenChange = vi.fn();
  render(
    <NewSpaceDialog
      open
      onOpenChange={onOpenChange}
      onStartFromScratch={onStartFromScratch}
      onUseLocalFolder={vi.fn(async () => true)}
    />
  );
  return { onStartFromScratch, onOpenChange };
}

describe('NewSpaceDialog', () => {
  it('asks for a name before creating a blank Space', async () => {
    const { onStartFromScratch, onOpenChange } = renderDialog();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Start from scratch',
      })
    );
    expect(onStartFromScratch).not.toHaveBeenCalled();

    const create = screen.getByRole('button', {
      name: 'Create Space',
    });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  SMA敏护  ' },
    });
    expect(create).toBeEnabled();
    fireEvent.click(create);

    await waitFor(() =>
      expect(onStartFromScratch).toHaveBeenCalledWith('SMA敏护')
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('goes back to the options without creating anything', () => {
    const { onStartFromScratch } = renderDialog();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Start from scratch',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      screen.getByRole('button', {
        name: 'Start from scratch',
      })
    ).toBeInTheDocument();
    expect(onStartFromScratch).not.toHaveBeenCalled();
  });
});
