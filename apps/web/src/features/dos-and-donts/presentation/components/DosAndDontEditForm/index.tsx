'use client';

import { useCallback, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { DosAndDontCategory, DosAndDontType } from '@sfx/validation';
import {
  DOS_AND_DONT_BODY_MAX_LENGTH,
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TITLE_MAX_LENGTH,
  DOS_AND_DONT_TYPE_VALUES,
} from '../../../constants';
import {
  dosAndDontFormSchema,
  type DosAndDontFormValues,
} from '../../validators/dos-and-dont-form';
import type { DosAndDontEditFormProps } from './types';

function typeLabel(
  type: DosAndDontType,
  translations: DosAndDontEditFormProps['translations'],
): string {
  return type === 'do'
    ? translations.dosAndDontTypeDoLabel
    : translations.dosAndDontTypeDontLabel;
}

function categoryLabel(
  category: DosAndDontCategory,
  translations: DosAndDontEditFormProps['translations'],
): string {
  switch (category) {
    case 'tone':
      return translations.dosAndDontCategoryToneLabel;
    case 'vocabulary':
      return translations.dosAndDontCategoryVocabularyLabel;
    case 'visuals':
      return translations.dosAndDontCategoryVisualsLabel;
    case 'legal':
      return translations.dosAndDontCategoryLegalLabel;
    case 'campaign-messaging':
      return translations.dosAndDontCategoryCampaignMessagingLabel;
  }
}

export function DosAndDontEditForm(props: DosAndDontEditFormProps): ReactNode {
  const {
    defaultValues,
    translations,
    isSubmitting,
    serverError,
    submitLabel,
    cancelLabel,
    onSubmit,
    onCancel,
  } = props;

  const form = useForm<DosAndDontFormValues>({
    resolver: zodResolver(
      dosAndDontFormSchema as unknown as Parameters<typeof zodResolver>[0],
    ),
    defaultValues,
  });

  const submitHandler = useCallback(
    async (values: DosAndDontFormValues): Promise<void> => {
      await onSubmit(values);
    },
    [onSubmit],
  );

  const errors = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const selectedType = form.watch('type');

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(submitHandler)}
        className="space-y-6"
        aria-label={translations.editDosAndDontPageTitle}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {translations.dosAndDontTypeLabel}
          </legend>
          <div role="radiogroup" className="flex gap-2">
            {DOS_AND_DONT_TYPE_VALUES.map((typeValue) => (
              <label
                key={typeValue}
                className={`cursor-pointer rounded-md border px-4 py-2 text-sm ${
                  selectedType === typeValue
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted'
                }`}
              >
                <input
                  type="radio"
                  value={typeValue}
                  className="sr-only"
                  {...form.register('type')}
                />
                {typeLabel(typeValue, translations)}
              </label>
            ))}
          </div>
          {errors.type?.message !== undefined ? (
            <span className="block text-xs text-destructive">
              {translations.dosAndDontTypeRequiredError}
            </span>
          ) : null}
        </fieldset>

        <label className="block text-sm text-foreground">
          <span>{translations.dosAndDontCategoryLabel}</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={errors.category?.message !== undefined}
            {...form.register('category')}
          >
            {DOS_AND_DONT_CATEGORY_VALUES.map((categoryValue) => (
              <option key={categoryValue} value={categoryValue}>
                {categoryLabel(categoryValue, translations)}
              </option>
            ))}
          </select>
          {errors.category?.message !== undefined ? (
            <span className="mt-1 block text-xs text-destructive">
              {translations.dosAndDontCategoryRequiredError}
            </span>
          ) : null}
        </label>

        <label className="block text-sm text-foreground">
          <span>{translations.dosAndDontTitleLabel}</span>
          <input
            type="text"
            maxLength={DOS_AND_DONT_TITLE_MAX_LENGTH}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={errors.title?.message !== undefined}
            {...form.register('title')}
          />
          {errors.title?.message !== undefined ? (
            <span className="mt-1 block text-xs text-destructive">
              {translations.dosAndDontTitleRequiredError}
            </span>
          ) : null}
        </label>

        <label className="block text-sm text-foreground">
          <span>{translations.dosAndDontBodyLabel}</span>
          <textarea
            maxLength={DOS_AND_DONT_BODY_MAX_LENGTH}
            className="mt-1 h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={errors.body?.message !== undefined}
            {...form.register('body')}
          />
          {errors.body?.message !== undefined ? (
            <span className="mt-1 block text-xs text-destructive">
              {translations.dosAndDontBodyRequiredError}
            </span>
          ) : null}
        </label>

        <label className="block text-sm text-foreground">
          <span>{translations.dosAndDontSuggestedCorrectionLabel}</span>
          <textarea
            maxLength={DOS_AND_DONT_BODY_MAX_LENGTH}
            className="mt-1 h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={errors.suggestedCorrection?.message !== undefined}
            {...form.register('suggestedCorrection')}
          />
          {errors.suggestedCorrection?.message !== undefined ? (
            <span className="mt-1 block text-xs text-destructive">
              {translations.dosAndDontSuggestedCorrectionTooLongError}
            </span>
          ) : null}
        </label>

        {serverError !== null ? (
          <p className="text-sm text-destructive">{serverError}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !form.formState.isValid}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
