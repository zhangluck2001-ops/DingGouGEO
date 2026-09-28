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
  dataset: 'facts' | 'answers' | 'citations' | 'probes' | 'contents';
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
 * The workbench is the right-hand half of the Workspace page: the same
 * destinations as Home (models, skills, GEO boards, …) rendered beside the
 * AI chat so people and the agent look at the same surface.
 */
export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      open: true,
      section: 'geo-overview',
      width: WORKBENCH_DEFAULT_WIDTH,
      navCollapsed: false,
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((state) => ({ open: !state.open })),
      openSection: (section) => set({ section, open: true }),
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
