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
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          const noopStorage: Storage = {
            length: 0,
            clear: (): void => undefined,
            getItem: (): string | null => null,
            key: (): string | null => null,
            removeItem: (): void => undefined,
            setItem: (): void => undefined,
          };
          return noopStorage;
        }
        return window.localStorage;
      }),
    },
  ),
);
