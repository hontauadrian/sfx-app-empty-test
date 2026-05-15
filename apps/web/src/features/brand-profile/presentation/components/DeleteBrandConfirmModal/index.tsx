'use client';

import type { ReactNode } from 'react';
import type { DeleteBrandConfirmModalProps } from './types';

export function DeleteBrandConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel,
  isSubmitting,
  onConfirm,
  onCancel,
}: DeleteBrandConfirmModalProps): ReactNode {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-brand-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h2 id="delete-brand-title" className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
