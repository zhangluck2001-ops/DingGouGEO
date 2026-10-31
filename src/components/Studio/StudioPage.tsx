// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
import { useEffect, useReducer, useState } from 'react';

import { BrandCardDialog } from './BrandCardDialog';
import { MemoryDialog } from './MemoryDialog';
import { ModeRail } from './ModeRail';
import { StudioChat } from './StudioChat';
import { StudioTopBar } from './StudioTopBar';
import { WorkPanel } from './WorkPanel';
import { createInitialStudioState, studioReducer } from './studioState';

export default function StudioPage() {
  const [state, dispatch] = useReducer(
    studioReducer,
    undefined,
    createInitialStudioState,
  );
  const [showWorkPanel, setShowWorkPanel] = useState(true);

  // Auto-collapse the right work panel on narrow windows (< 1100px).
  useEffect(() => {
    const handler = () => setShowWorkPanel(window.innerWidth >= 1100);
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Demo timer: ~20s after opening (or switching products), insert a fresh
  // activity item so the unread badge on the 动态 tab can be exercised.
  useEffect(() => {
    const handle = setTimeout(
      () => dispatch({ type: 'ADD_FRESH_FEED' }),
      20000,
    );
    return () => clearTimeout(handle);
  }, [state.currentProductId, dispatch]);

  const gridCols = showWorkPanel
    ? 'grid-cols-[232px_minmax(360px,1fr)_400px]'
    : 'grid-cols-[232px_minmax(360px,1fr)]';

  return (
    <div className="flex h-full min-h-0 flex-col pt-10">
      <StudioTopBar state={state} dispatch={dispatch} />
      <div className={`grid min-h-0 flex-1 overflow-hidden ${gridCols}`}>
        <ModeRail state={state} dispatch={dispatch} />
        <StudioChat
          state={state}
          dispatch={dispatch}
          showWorkPanel={showWorkPanel}
          onToggleWorkPanel={() => setShowWorkPanel((v) => !v)}
        />
        {showWorkPanel ? (
          <WorkPanel state={state} dispatch={dispatch} />
        ) : null}
      </div>
      <BrandCardDialog
        open={state.brandCardOpen}
        onClose={() => dispatch({ type: 'CLOSE_BRAND_CARD' })}
      />
      <MemoryDialog state={state} dispatch={dispatch} />
    </div>
  );
}
