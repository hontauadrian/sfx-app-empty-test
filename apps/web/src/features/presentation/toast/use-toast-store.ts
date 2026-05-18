import { create } from 'zustand';
import type { Toast, ToastStoreState, ToastVariant } from './types';

export const TOAST_AUTO_DISMISS_MS = 5000;

let toastIdCounter = 0;

function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now().toString(36)}-${toastIdCounter.toString(36)}`;
}

export const useToastStore = create<ToastStoreState>()((set, get) => ({
  toasts: [],
  pushToast: (variant: ToastVariant, message: string): string => {
    const id = generateToastId();
    const toast: Toast = { id, variant, message };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        const stillPresent = get().toasts.some((entry) => entry.id === id);
        if (stillPresent) {
          set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }));
        }
      }, TOAST_AUTO_DISMISS_MS);
    }
    return id;
  },
  dismissToast: (id: string): void => {
    set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) }));
  },
  clear: (): void => set({ toasts: [] }),
}));
