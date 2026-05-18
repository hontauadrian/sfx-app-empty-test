'use client';

import type { ReactNode } from 'react';
import { useRenameBrandDialog } from './use-rename-brand-dialog';
import type { RenameBrandDialogProps } from './types';

export function RenameBrandDialog(props: RenameBrandDialogProps): ReactNode {
  const { uiModel, nameValue, handleNameChange, handleSubmit, handleCancel } =
    useRenameBrandDialog(props);

  if (!props.open || !props.brand) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-brand-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 id="rename-brand-dialog-title" className="text-xl font-semibold text-foreground">
          {uiModel.title}
        </h2>
        <form
          className="mt-4 flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <label htmlFor="rename-brand-name" className="text-sm font-medium text-foreground">
            {uiModel.nameLabel}
          </label>
          <input
            id="rename-brand-name"
            type="text"
            value={nameValue}
            onChange={(event) => handleNameChange(event.target.value)}
            aria-invalid={uiModel.nameError !== null}
            aria-describedby={uiModel.nameError ? 'rename-brand-name-error' : undefined}
            autoFocus
            className="min-h-11 rounded-md border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {uiModel.nameError ? (
            <p id="rename-brand-name-error" role="alert" className="text-sm text-destructive">
              {uiModel.nameError}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-11 rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted"
            >
              {uiModel.cancelLabel}
            </button>
            <button
              type="submit"
              disabled={uiModel.submitDisabled}
              aria-busy={uiModel.pending || undefined}
              className="min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {uiModel.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
