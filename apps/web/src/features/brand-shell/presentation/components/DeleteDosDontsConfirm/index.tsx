'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import type { DeleteDosDontsConfirmProps } from './types';

export function DeleteDosDontsConfirm({
  open,
  ruleFragment,
  isSubmitting,
  onConfirm,
  onCancel,
}: DeleteDosDontsConfirmProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.dosAndDonts!.deleteConfirm;
  if (!open) return null;
  const body = labels.bodyTemplate.replace('{ruleFragment}', ruleFragment);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dos-donts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card p-6 text-foreground shadow-lg">
        <h2 id="delete-dos-donts-title" className="text-lg font-semibold">
          {labels.title}
        </h2>
        <p className="mt-2 text-sm">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-border bg-background px-3 py-1 text-sm"
          >
            {labels.cancelCta}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded bg-destructive px-3 py-1 text-sm text-destructive-foreground disabled:opacity-50"
          >
            {isSubmitting ? labels.confirmingCta : labels.confirmCta}
          </button>
        </div>
      </div>
    </div>
  );
}
