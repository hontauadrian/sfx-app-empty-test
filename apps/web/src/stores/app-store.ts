import { create } from 'zustand';

interface AppState {
  readonly isSidebarOpen: boolean;
  readonly toggleSidebar: () => void;
  readonly setSidebarOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  isSidebarOpen: true,
  toggleSidebar: (): void => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen: boolean): void => set({ isSidebarOpen: isOpen }),
}));
