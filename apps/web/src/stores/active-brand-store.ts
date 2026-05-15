'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const ACTIVE_BRAND_STORAGE_KEY = 'sfx.activeBrand';

interface ActiveBrandState {
  readonly activeBrandId: string | null;
  readonly setActiveBrandId: (id: string | null) => void;
  readonly clear: () => void;
}

export const useActiveBrandStore = create<ActiveBrandState>()(
  persist(
    (set) => ({
      activeBrandId: null,
      setActiveBrandId: (id: string | null): void => set({ activeBrandId: id }),
      clear: (): void => set({ activeBrandId: null }),
    }),
    {
      name: ACTIVE_BRAND_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
