'use client';

import type { ReactNode } from 'react';
import { useDeleteBrandConfirm } from './use-delete-brand-confirm';
import type { DeleteBrandConfirmProps } from './types';

export function DeleteBrandConfirm(props: DeleteBrandConfirmProps): ReactNode {
  const { uiModel, handleConfirm, handleCancel } = useDeleteBrandConfirm(props);

  if (!props.open || !props.brand) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-brand-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 id="delete-brand-confirm-title" className="text-xl font-semibold text-foreground">
          {uiModel.title}
        </h2>
        <p className="mt-3 text-muted-foreground">{uiModel.bodyMessage}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="min-h-11 rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted"
          >
            {uiModel.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={uiModel.confirmDisabled}
            aria-busy={uiModel.pending || undefined}
            className="min-h-11 rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          >
            {uiModel.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
