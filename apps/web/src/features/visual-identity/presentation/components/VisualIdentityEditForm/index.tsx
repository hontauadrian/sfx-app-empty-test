'use client';

import { useCallback, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH,
  VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH,
} from '../../../constants';
import {
  visualIdentityFormSchema,
  type VisualIdentityFormValues,
} from '../../validators/visual-identity-form';
import { ColourPaletteListEditor } from '../ColourPaletteListEditor';
import { TypographyRulesListEditor } from '../TypographyRulesListEditor';
import type { VisualIdentityEditFormProps } from './types';

export function VisualIdentityEditForm(
  props: VisualIdentityEditFormProps,
): ReactNode {
  const {
    defaultValues,
    translations,
    isSubmitting,
    serverError,
    saveLabel,
    cancelLabel,
    onSubmit,
    onCancel,
  } = props;

  const form = useForm<VisualIdentityFormValues>({
    resolver: zodResolver(
      visualIdentityFormSchema as unknown as Parameters<typeof zodResolver>[0],
    ),
    defaultValues,
  });

  const submitHandler = useCallback(
    async (values: VisualIdentityFormValues): Promise<void> => {
      await onSubmit(values);
    },
    [onSubmit],
  );

  const longTextField = (
    name: keyof VisualIdentityFormValues,
    label: string,
  ): ReactNode => {
    const errorMessage = (
      form.formState.errors as Record<string, { message?: string } | undefined>
    )[name]?.message;
    return (
      <label className="block text-sm text-foreground">
        <span>{label}</span>
        <textarea
          maxLength={VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH}
          className="mt-1 h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          aria-invalid={errorMessage !== undefined}
          {...form.register(name as never)}
        />
        {errorMessage !== undefined ? (
          <span className="mt-1 block text-xs text-destructive">{errorMessage}</span>
        ) : null}
      </label>
    );
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(submitHandler)}
        className="space-y-6"
        aria-label={translations.visualIdentityEditPageTitle}
      >
        {longTextField('logoUsageRules', translations.visualIdentityLogoUsageRulesLabel)}

        <ColourPaletteListEditor
          control={form.control}
          label={translations.visualIdentityColourPaletteLabel}
          nameLabel={translations.visualIdentityColourPaletteNameLabel}
          hexLabel={translations.visualIdentityColourPaletteHexLabel}
          usageLabel={translations.visualIdentityColourPaletteUsageLabel}
          addLabel={translations.visualIdentityAddRow}
          removeLabel={translations.visualIdentityRemoveRow}
          emptyPlaceholder={translations.visualIdentityEmptyListPlaceholder}
          nameMaxLength={VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH}
        />

        <TypographyRulesListEditor
          control={form.control}
          label={translations.visualIdentityTypographyRulesLabel}
          roleLabel={translations.visualIdentityTypographyRoleLabel}
          familyLabel={translations.visualIdentityTypographyFamilyLabel}
          weightLabel={translations.visualIdentityTypographyWeightLabel}
          sizeLabel={translations.visualIdentityTypographySizeLabel}
          notesLabel={translations.visualIdentityTypographyNotesLabel}
          addLabel={translations.visualIdentityAddRow}
          removeLabel={translations.visualIdentityRemoveRow}
          emptyPlaceholder={translations.visualIdentityEmptyListPlaceholder}
          shortMaxLength={VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH}
        />

        {longTextField(
          'spacingLayoutGuidance',
          translations.visualIdentitySpacingLayoutGuidanceLabel,
        )}
        {longTextField(
          'imageStyleGuidance',
          translations.visualIdentityImageStyleGuidanceLabel,
        )}
        {longTextField(
          'iconographyGuidance',
          translations.visualIdentityIconographyGuidanceLabel,
        )}
        {longTextField(
          'usageRestrictions',
          translations.visualIdentityUsageRestrictionsLabel,
        )}

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
            disabled={isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
