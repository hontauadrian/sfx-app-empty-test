'use client';

import { useCallback, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BRAND_VOICE_AUDIENCE_MAX_LENGTH,
  BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH,
  BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH,
  BRAND_VOICE_PHRASE_MAX_LENGTH,
  BRAND_VOICE_TONE_MAX_LENGTH,
} from '../../../constants';
import {
  brandVoiceFormSchema,
  type BrandVoiceFormValues,
} from '../../validators/brand-voice-form';
import { StringListField } from '../StringListField';
import { AudienceRuleListField } from '../AudienceRuleListField';
import type { VoiceEditFormProps } from './types';

export function VoiceEditForm(props: VoiceEditFormProps): ReactNode {
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

  const form = useForm<BrandVoiceFormValues>({
    resolver: zodResolver(
      brandVoiceFormSchema as unknown as Parameters<typeof zodResolver>[0],
    ),
    defaultValues,
  });

  const submitHandler = useCallback(
    async (values: BrandVoiceFormValues): Promise<void> => {
      await onSubmit(values);
    },
    [onSubmit],
  );

  const toneError = form.formState.errors.toneOfVoice?.message;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(submitHandler)}
        className="space-y-6"
        aria-label={translations.brandVoiceEditPageTitle}
      >
        <label className="block text-sm text-foreground">
          <span>{translations.brandVoiceToneOfVoiceLabel}</span>
          <textarea
            maxLength={BRAND_VOICE_TONE_MAX_LENGTH}
            className="mt-1 h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            aria-invalid={toneError !== undefined}
            {...form.register('toneOfVoice')}
          />
          {toneError !== undefined ? (
            <span className="mt-1 block text-xs text-destructive">{toneError}</span>
          ) : null}
        </label>

        <StringListField
          control={form.control}
          name="preferredVocabulary"
          label={translations.brandVoicePreferredVocabularyLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH}
        />

        <StringListField
          control={form.control}
          name="restrictedVocabulary"
          label={translations.brandVoiceRestrictedVocabularyLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH}
        />

        <StringListField
          control={form.control}
          name="messagingPillars"
          label={translations.brandVoiceMessagingPillarsLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH}
        />

        <StringListField
          control={form.control}
          name="writingStyleRules"
          label={translations.brandVoiceWritingStyleRulesLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH}
        />

        <AudienceRuleListField
          control={form.control}
          label={translations.brandVoiceAudienceRulesLabel}
          audienceLabel={translations.brandVoiceAudienceRuleAudienceLabel}
          ruleLabel={translations.brandVoiceAudienceRuleRuleLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          audienceMaxLength={BRAND_VOICE_AUDIENCE_MAX_LENGTH}
          ruleMaxLength={BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH}
        />

        <StringListField
          control={form.control}
          name="approvedExamplePhrases"
          label={translations.brandVoiceApprovedPhrasesLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_PHRASE_MAX_LENGTH}
        />

        <StringListField
          control={form.control}
          name="rejectedExamplePhrases"
          label={translations.brandVoiceRejectedPhrasesLabel}
          addLabel={translations.brandVoiceAddRow}
          removeLabel={translations.brandVoiceRemoveRow}
          emptyPlaceholder={translations.brandVoiceEmptyListPlaceholder}
          itemMaxLength={BRAND_VOICE_PHRASE_MAX_LENGTH}
        />

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
