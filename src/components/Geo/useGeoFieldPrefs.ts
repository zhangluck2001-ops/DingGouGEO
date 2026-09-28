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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GEO_DATASETS, type GeoField } from './datasets';

interface FieldPrefs {
  hidden: string[];
  shown: string[];
  widths: Record<string, number>;
}

const EMPTY: FieldPrefs = { hidden: [], shown: [], widths: {} };
const MIN_COLUMN_WIDTH = 56;

function storageKey(dataset: GeoDatasetKey) {
  return `eigent-geo-fields:${dataset}`;
}

function read(dataset: GeoDatasetKey): FieldPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(dataset));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as FieldPrefs) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Per-viewer column visibility and widths for one dataset. Stored in the
 * browser only; it's a view convenience, not shared state.
 */
export function useGeoFieldPrefs(dataset: GeoDatasetKey) {
  const [prefs, setPrefs] = useState<FieldPrefs>(() => read(dataset));

  useEffect(() => {
    setPrefs(read(dataset));
  }, [dataset]);

  const persist = useCallback(
    (next: FieldPrefs) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey(dataset), JSON.stringify(next));
      } catch {
        // Storage can be unavailable; the grid still works for this session.
      }
    },
    [dataset]
  );

  const fields = GEO_DATASETS[dataset].fields;

  const isVisible = useCallback(
    (field: GeoField) =>
      prefs.shown.includes(field.key) ||
      (field.visible !== false && !prefs.hidden.includes(field.key)),
    [prefs]
  );

  const visibleFields = useMemo(
    () =>
      fields.filter(isVisible).map((field) => ({
        ...field,
        width: prefs.widths[field.key] ?? field.width,
      })),
    [fields, isVisible, prefs.widths]
  );

  const setVisible = useCallback(
    (key: string, visible: boolean) => {
      persist({
        ...prefs,
        hidden: visible
          ? prefs.hidden.filter((item) => item !== key)
          : [...new Set([...prefs.hidden, key])],
        shown: visible
          ? [...new Set([...prefs.shown, key])]
          : prefs.shown.filter((item) => item !== key),
      });
    },
    [persist, prefs]
  );

  const setWidth = useCallback(
    (key: string, width: number) => {
      persist({
        ...prefs,
        widths: {
          ...prefs.widths,
          [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
        },
      });
    },
    [persist, prefs]
  );

  const reset = useCallback(() => persist(EMPTY), [persist]);

  return { fields, visibleFields, isVisible, setVisible, setWidth, reset };
}
