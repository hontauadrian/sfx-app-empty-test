'use client';

import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { BRAND_DESCRIPTION_MAX_LENGTH, BRAND_NAME_MAX_LENGTH } from '../../../constants';
import { useNewBrand } from './use-new-brand';

export function NewBrandPage(): ReactNode {
  const { uiModel, handleSubmit, handleCancel } = useNewBrand();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const onNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setName(event.target.value);
      setNameError(null);
    },
    [],
  );

  const onDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>): void => {
      setDescription(event.target.value);
      setDescriptionError(null);
    },
    [],
  );

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      let hasError = false;
      if (trimmedName.length === 0) {
        setNameError(uiModel.nameRequiredError);
        hasError = true;
      } else if (trimmedName.length > BRAND_NAME_MAX_LENGTH) {
        setNameError(uiModel.nameTooLongError);
        hasError = true;
      }
      if (trimmedDescription.length > BRAND_DESCRIPTION_MAX_LENGTH) {
        setDescriptionError(uiModel.descriptionTooLongError);
        hasError = true;
      }
      if (hasError) return;
      await handleSubmit({
        name: trimmedName,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
      });
    },
    [
      name,
      description,
      uiModel.nameRequiredError,
      uiModel.nameTooLongError,
      uiModel.descriptionTooLongError,
      handleSubmit,
    ],
  );

  return (
    <section className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-label={uiModel.title}>
        <label className="block text-sm text-foreground">
          <span>{uiModel.nameLabel}</span>
          <input
            type="text"
            value={name}
            onChange={onNameChange}
            placeholder={uiModel.namePlaceholder}
            maxLength={BRAND_NAME_MAX_LENGTH}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={nameError !== null}
            aria-describedby={nameError !== null ? 'new-brand-name-error' : undefined}
          />
          {nameError !== null ? (
            <p id="new-brand-name-error" className="mt-1 text-xs text-destructive">
              {nameError}
            </p>
          ) : null}
        </label>
        <label className="block text-sm text-foreground">
          <span>{uiModel.descriptionLabel}</span>
          <textarea
            value={description}
            onChange={onDescriptionChange}
            placeholder={uiModel.descriptionPlaceholder}
            maxLength={BRAND_DESCRIPTION_MAX_LENGTH}
            className="mt-1 h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={descriptionError !== null}
            aria-describedby={descriptionError !== null ? 'new-brand-description-error' : undefined}
          />
          {descriptionError !== null ? (
            <p id="new-brand-description-error" className="mt-1 text-xs text-destructive">
              {descriptionError}
            </p>
          ) : null}
        </label>
        {uiModel.serverErrorLabel !== null ? (
          <p className="text-sm text-destructive">{uiModel.serverErrorLabel}</p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            {uiModel.cancelLabel}
          </button>
          <button
            type="submit"
            disabled={uiModel.isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {uiModel.submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
