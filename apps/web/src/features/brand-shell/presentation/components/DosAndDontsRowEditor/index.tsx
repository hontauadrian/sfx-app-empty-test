'use client';

import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { DOS_DONTS_CATEGORIES, DOS_DONTS_TYPES } from '../../../data/dos-donts-enums';
import type { DosDontsCategory, DosDontsType } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import {
  validateUpsertDosDontsEntry,
  type UpsertDosDontsValidationMessages,
} from '../../validators/upsert-dos-donts-entry.resolver';
import type {
  DosDontsRowEditorErrors,
  DosDontsRowEditorProps,
  DosDontsRowEditorValues,
} from './types';

export function DosAndDontsRowEditor({
  initialValues,
  isSubmitting,
  onSubmit,
  onCancel,
}: DosDontsRowEditorProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.dosAndDonts!;
  const [values, setValues] = useState<DosDontsRowEditorValues>(initialValues);
  const [errors, setErrors] = useState<DosDontsRowEditorErrors>({});

  const messages: UpsertDosDontsValidationMessages = labels.validation;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const validationErrors = validateUpsertDosDontsEntry(values, messages);
      setErrors(validationErrors);
      if (Object.keys(validationErrors).length === 0) onSubmit(values);
    },
    [values, messages, onSubmit],
  );

  const submitLabel = isSubmitting ? labels.cta.saving : labels.cta.save;

  return (
    <form
      data-testid="dos-donts-row-editor"
      onSubmit={handleSubmit}
      noValidate
      className="space-y-3 rounded-md border border-border bg-card p-4 text-foreground"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {labels.fields.type.label}
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
            value={values.type}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, type: event.target.value as DosDontsType | '' }))
            }
          >
            <option value="">—</option>
            {DOS_DONTS_TYPES.map((option) => (
              <option key={option} value={option}>
                {labels.typeOptions[option]}
              </option>
            ))}
          </select>
          {errors.type ? (
            <span className="mt-1 block text-xs text-destructive">{errors.type}</span>
          ) : null}
        </label>
        <label className="text-sm font-medium">
          {labels.fields.category.label}
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1"
            value={values.category}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                category: event.target.value as DosDontsCategory | '',
              }))
            }
          >
            <option value="">—</option>
            {DOS_DONTS_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {labels.categoryOptions[option]}
              </option>
            ))}
          </select>
          {errors.category ? (
            <span className="mt-1 block text-xs text-destructive">{errors.category}</span>
          ) : null}
        </label>
      </div>
      <label className="block text-sm font-medium">
        {labels.fields.ruleText.label}
        <textarea
          className="mt-1 w-full rounded border border-border bg-background px-2 py-2"
          rows={3}
          value={values.ruleText}
          placeholder={labels.fields.ruleText.placeholder}
          onChange={(event) =>
            setValues((prev) => ({ ...prev, ruleText: event.target.value }))
          }
        />
        {errors.ruleText ? (
          <span className="mt-1 block text-xs text-destructive">{errors.ruleText}</span>
        ) : null}
      </label>
      <label className="block text-sm font-medium">
        {labels.fields.exampleText.label}
        <textarea
          className="mt-1 w-full rounded border border-border bg-background px-2 py-2"
          rows={2}
          value={values.exampleText}
          placeholder={labels.fields.exampleText.placeholder}
          onChange={(event) =>
            setValues((prev) => ({ ...prev, exampleText: event.target.value }))
          }
        />
        {errors.exampleText ? (
          <span className="mt-1 block text-xs text-destructive">{errors.exampleText}</span>
        ) : null}
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border bg-background px-3 py-1 text-sm"
        >
          {labels.cta.cancel}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
