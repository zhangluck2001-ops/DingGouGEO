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

import { useGeoSpaceBootstrap } from '@/components/Geo/useGeoSpaceBootstrap';
import {
  APP_SHELL_COLUMN_GAP_PX,
  APP_SHELL_SIDEBAR_WIDTH_PX,
} from '@/components/Layout/AppShellLayout';
import { usePageTabStore } from '@/store/pageTabStore';
import {
  useWorkbenchStore,
  WORKBENCH_CHAT_MIN_WIDTH,
  WORKBENCH_MIN_WIDTH,
} from '@/store/workbenchStore';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import Workbench from '.';

const KEYBOARD_STEP = 32;

/**
 * Trailing column of the Workspace page: the GEO panel to the right of the
 * chat, like an artifact beside a Claude conversation. Rendered through
 * `AppShellLayout`'s `trailing` slot, with a draggable divider on its left.
 */
export default function WorkbenchPane() {
  const { t } = useTranslation();
  useGeoSpaceBootstrap();
  const open = useWorkbenchStore((state) => state.open);
  const width = useWorkbenchStore((state) => state.width);
  const setWidth = useWorkbenchStore((state) => state.setWidth);
  const sidebarHidden = usePageTabStore(
    (state) => state.workspaceSidebarHidden
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const shouldReduceMotion = Boolean(useReducedMotion());

  // Measure the whole shell row so the chat keeps usable room.
  useEffect(() => {
    const row = anchorRef.current?.parentElement;
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => {
      setRowWidth(entry.contentRect.width);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const railWidth = sidebarHidden
    ? 0
    : APP_SHELL_SIDEBAR_WIDTH_PX + APP_SHELL_COLUMN_GAP_PX;
  const available = Math.max(0, rowWidth - railWidth);
  // On narrow windows the chat keeps at least 40% of what's left, so neither
  // side can squeeze the other out completely.
  const chatMin = Math.min(WORKBENCH_CHAT_MIN_WIDTH, available * 0.4);
  const maxWidth = Math.max(0, available - chatMin);
  const minWidth = Math.min(WORKBENCH_MIN_WIDTH, maxWidth);
  const effectiveWidth = rowWidth
    ? Math.min(Math.max(width, minWidth), maxWidth)
    : width;

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const row = anchorRef.current?.parentElement;
      if (!row) return;
      event.preventDefault();
      setDragging(true);
      const right = row.getBoundingClientRect().right;
      const handleMove = (moveEvent: PointerEvent) => {
        setWidth(Math.min(right - moveEvent.clientX, maxWidth));
      };
      const handleUp = () => {
        setDragging(false);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [maxWidth, setWidth]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setWidth(Math.min(effectiveWidth + KEYBOARD_STEP, maxWidth));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setWidth(effectiveWidth - KEYBOARD_STEP);
    }
  };

  return (
    <>
      <div ref={anchorRef} className="hidden" aria-hidden />
      {dragging ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 cursor-col-resize"
        />
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="workbench"
            className="flex h-full min-h-0 shrink-0 flex-row overflow-hidden"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: effectiveWidth + 2, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={
              shouldReduceMotion || dragging
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
            }
          >
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label={t('layout.workbench-resize', {
                defaultValue: 'Resize workbench',
              })}
              aria-valuenow={Math.round(effectiveWidth)}
              aria-valuemin={Math.round(minWidth)}
              aria-valuemax={Math.round(maxWidth)}
              onPointerDown={handlePointerDown}
              onKeyDown={handleKeyDown}
              data-resize-handle-state={dragging ? 'drag' : 'inactive'}
              className="relative z-10 flex w-[2px] shrink-0 cursor-col-resize items-center justify-center bg-transparent before:absolute before:inset-y-0 before:-right-1 before:-left-1 before:content-[''] after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 after:bg-ds-neutral-default-default after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:outline-none focus-visible:after:opacity-100"
            />
            <div
              className="h-full min-h-0 shrink-0"
              style={{ width: effectiveWidth }}
            >
              <Workbench />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
