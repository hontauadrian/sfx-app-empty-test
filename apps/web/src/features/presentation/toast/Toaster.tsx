'use client';

import type { ReactNode } from 'react';
import { useToastStore } from './use-toast-store';

export function Toaster(): ReactNode {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      data-testid="toaster"
    >
      <ul className="flex flex-col gap-2">
        {toasts.map((toast) => {
          const variantClass =
            toast.variant === 'success'
              ? 'border-border bg-card text-foreground'
              : 'border-destructive bg-destructive text-destructive-foreground';
          return (
            <li
              key={toast.id}
              data-variant={toast.variant}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-md border ${variantClass} px-4 py-3 shadow-md`}
            >
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismissToast(toast.id)}
                className="text-sm font-semibold opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
