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

import type { GeoDatasetKey } from '@/api/geo';
import {
  getSessionPreviewSlice,
  usePageTabStore,
  WorkspaceTab,
} from '@/store/pageTabStore';
import type { SettingsSectionId } from '@/store/settingsStore';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Width bounds for the right-hand workbench beside the chat. */
export const WORKBENCH_MIN_WIDTH = 520;
export const WORKBENCH_DEFAULT_WIDTH = 760;
/** Keep at least this much room for the chat column. */
export const WORKBENCH_CHAT_MIN_WIDTH = 360;

/** A filter or record another GEO stage should open with. */
export interface GeoDrillRequest {
  dataset: GeoDatasetKey;
  field?: string;
  value?: string;
  recordId?: number;
}

export interface WorkbenchChatDraft {
  id: number;
  content: string;
}

interface WorkbenchState {
  open: boolean;
  section: SettingsSectionId;
  width: number;
  navCollapsed: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  openSection: (section: SettingsSectionId) => void;
  setWidth: (width: number) => void;
  toggleNavCollapsed: () => void;
  /** One-shot text the workbench hands to whichever chat composer is shown. */
  chatDraft: WorkbenchChatDraft | null;
  /** Bumped when GEO projects change (e.g. a Space was set up). */
  geoProjectsVersion: number;
  geoDrill: GeoDrillRequest | null;
  setGeoDrill: (request: GeoDrillRequest | null) => void;
  bumpGeoProjects: () => void;
  sendToChat: (content: string) => void;
  consumeChatDraft: (id: number) => void;
}

/**
 * Inside a session the GEO pages are a tab of the session's right panel, so
 * there is only ever one panel beside the chat. Elsewhere (the new-session
 * page, Files, …) they show in the standalone workbench column.
 */
function inSessionPanel(): boolean {
  const tabs = usePageTabStore.getState();
  return (
    tabs.activeWorkspaceTab === WorkspaceTab.Project &&
    Boolean(tabs.sessionPreviewProjectId)
  );
}

/** Whether the panel beside the chat is open (the top bar toggle). */
export function useRightPanelOpen(): boolean {
  const inSession = usePageTabStore(
    (state) =>
      state.activeWorkspaceTab === WorkspaceTab.Project &&
      Boolean(state.sessionPreviewProjectId)
  );
  const sessionPanelOpen = usePageTabStore(
    (state) => getSessionPreviewSlice(state).open
  );
  const workbenchOpen = useWorkbenchStore((state) => state.open);
  return inSession ? sessionPanelOpen : workbenchOpen;
}

/** Whether the GEO pages are on screen, wherever they are shown. */
export function useGeoVisible(): boolean {
  const inSession = usePageTabStore(
    (state) =>
      state.activeWorkspaceTab === WorkspaceTab.Project &&
      Boolean(state.sessionPreviewProjectId)
  );
  const geoTabShown = usePageTabStore((state) => {
    const slice = getSessionPreviewSlice(state);
    const active = slice.tabs.find((tab) => tab.id === slice.activeTabId);
    return slice.open && active?.type === 'geo';
  });
  const workbenchOpen = useWorkbenchStore((state) => state.open);
  return inSession ? geoTabShown : workbenchOpen;
}

/**
 * GEO pipeline pages beside the AI chat, so people and the agent look at the
 * same surface: the GEO tab in a session, the workbench column elsewhere.
 */
export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      open: true,
      section: 'geo-overview',
      width: WORKBENCH_DEFAULT_WIDTH,
      navCollapsed: false,
      setOpen: (open) => {
        if (!inSessionPanel()) {
          set({ open });
          return;
        }
        const tabs = usePageTabStore.getState();
        if (open) tabs.openPreviewTab('geo');
        else tabs.closeSessionPreview();
      },
      toggleOpen: () => {
        if (!inSessionPanel()) {
          set((state) => ({ open: !state.open }));
          return;
        }
        usePageTabStore.getState().toggleSessionPreview();
      },
      openSection: (section) => {
        if (!inSessionPanel()) {
          set({ section, open: true });
          return;
        }
        set({ section });
        usePageTabStore.getState().openPreviewTab('geo');
      },
      setWidth: (width) =>
        set({ width: Math.max(WORKBENCH_MIN_WIDTH, Math.round(width)) }),
      toggleNavCollapsed: () =>
        set((state) => ({ navCollapsed: !state.navCollapsed })),
      chatDraft: null,
      geoProjectsVersion: 0,
      geoDrill: null,
      setGeoDrill: (geoDrill) => set({ geoDrill }),
      bumpGeoProjects: () =>
        set((state) => ({ geoProjectsVersion: state.geoProjectsVersion + 1 })),
      sendToChat: (content) =>
        set((state) => ({
          chatDraft: {
            id: (state.chatDraft?.id ?? 0) + 1,
            content: content.trim(),
          },
        })),
      consumeChatDraft: (id) =>
        set((state) =>
          state.chatDraft?.id === id ? { chatDraft: null } : state
        ),
    }),
    {
      name: 'eigent-workbench',
      partialize: ({ open, section, width, navCollapsed }) => ({
        open,
        section,
        width,
        navCollapsed,
      }),
    }
  )
);
