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
import type { SettingsSectionId } from '@/store/settingsStore';
import {
  useWorkbenchStore,
  type GeoDrillRequest,
} from '@/store/workbenchStore';
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The pipeline stage page that owns each dataset. */
export const GEO_STAGE_FOR_DATASET: Record<GeoDatasetKey, SettingsSectionId> = {
  facts: 'geo-knowledge',
  probes: 'geo-probes',
  rounds: 'geo-answers',
  answers: 'geo-answers',
  analyses: 'geo-analysis',
  citations: 'geo-citations',
  contents: 'geo-drafts',
};

/**
 * Opens a GEO pipeline stage, optionally pre-filtered, in whichever surface
 * is showing the GEO pages: the Workspace workbench or the Home page.
 */
export function useOpenGeoStage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const openSection = useWorkbenchStore((state) => state.openSection);
  const setGeoDrill = useWorkbenchStore((state) => state.setGeoDrill);

  return useCallback(
    (section: SettingsSectionId, drill?: GeoDrillRequest) => {
      setGeoDrill(drill ?? null);
      if (pathname.startsWith('/home')) {
        navigate(`/home?section=settings&tab=${section}`, { replace: true });
      } else {
        openSection(section);
      }
    },
    [navigate, openSection, pathname, setGeoDrill]
  );
}
