'use client';

import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { BRAND_NAME_MAX_LENGTH } from '../../../constants';
import type { RenameBrandModalProps } from './types';

export function RenameBrandModal({
  title,
  nameLabel,
  initialName,
  submitLabel,
  cancelLabel,
  nameRequiredError,
  nameTooLongError,
  isSubmitting,
  onSubmit,
  onCancel,
}: RenameBrandModalProps): ReactNode {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setValue(event.target.value);
      setError(null);
    },
    [],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        setError(nameRequiredError);
        return;
      }
      if (trimmed.length > BRAND_NAME_MAX_LENGTH) {
        setError(nameTooLongError);
        return;
      }
      onSubmit(trimmed);
    },
    [value, nameRequiredError, nameTooLongError, onSubmit],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-brand-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6"
      >
        <h2 id="rename-brand-title" className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <label className="mt-4 block text-sm text-foreground">
          <span>{nameLabel}</span>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={error !== null}
            aria-describedby={error !== null ? 'rename-brand-error' : undefined}
            maxLength={BRAND_NAME_MAX_LENGTH}
            autoFocus
          />
        </label>
        {error !== null ? (
          <p id="rename-brand-error" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
