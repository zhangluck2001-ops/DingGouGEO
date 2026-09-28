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

import { geoApi } from '@/api/geo';
import { useAuthStore } from '@/store/authStore';
import { useSpaceStore } from '@/store/spaceStore';
import { useWorkbenchStore } from '@/store/workbenchStore';
import { useEffect } from 'react';

const ensured = new Set<string>();

/**
 * Every Space is a GEO brand project. The first time a Space is opened (and
 * after it's renamed) the backend links or creates its GEO project and
 * scaffolds the GEO pipeline folders inside the Space's folder.
 */
export function useGeoSpaceBootstrap() {
  const activeSpaceId = useSpaceStore((state) => state.activeSpaceId);
  const spaceName = useSpaceStore((state) =>
    state.activeSpaceId ? state.spaces[state.activeSpaceId]?.name : undefined
  );
  const email = useAuthStore((state) => state.email);
  const userId = useAuthStore((state) => state.user_id);
  const bumpGeoProjects = useWorkbenchStore((state) => state.bumpGeoProjects);

  useEffect(() => {
    if (!activeSpaceId || !spaceName) return;
    const key = `${activeSpaceId}:${spaceName}`;
    if (ensured.has(key)) return;
    ensured.add(key);
    void geoApi
      .ensureSpace({
        space_id: activeSpaceId,
        name: spaceName,
        email,
        user_id: userId == null ? null : String(userId),
      })
      .then(() => bumpGeoProjects())
      .catch((error: unknown) => {
        ensured.delete(key);
        console.warn('[GEO] Failed to set up Space project:', error);
      });
  }, [activeSpaceId, bumpGeoProjects, email, spaceName, userId]);
}
