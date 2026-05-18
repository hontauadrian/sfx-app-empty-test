'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import type { UpsertBrandVoiceInput, BrandVoice } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast/use-toast';
import { useBrandVoiceRepository } from '../../../data/repositories/use-brand-voice-repository';
import { upsertBrandVoiceResolver } from '../../validators/upsert-brand-voice.resolver';
import { mapToBrandVoiceFormUIModel } from './map-to-brand-voice-form-ui-model';
import type { UseBrandVoiceFormReturn } from './types';

interface ApiErrorBody {
  readonly success: false;
  readonly error: {
    readonly statusCode: number;
    readonly message: string;
    readonly errors?: ReadonlyArray<{ field: string; message: string }>;
  };
}

function isApiErrorEnvelope(value: unknown): value is { data: ApiErrorBody } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    typeof (value as { data?: unknown }).data === 'object' &&
    (value as { data: { success?: unknown } }).data?.success === false
  );
}

const EMPTY_DEFAULTS: UpsertBrandVoiceInput = {
  tone: '',
  preferredVocabulary: [],
  restrictedVocabulary: [],
  messagingPillars: [],
  writingStyleRules: '',
  audienceRules: [],
  approvedExamples: [],
  rejectedExamples: [],
};

function toFormValues(voice: BrandVoice | null): UpsertBrandVoiceInput {
  if (!voice) return EMPTY_DEFAULTS;
  return {
    tone: voice.tone,
    preferredVocabulary: [...voice.preferredVocabulary],
    restrictedVocabulary: [...voice.restrictedVocabulary],
    messagingPillars: voice.messagingPillars.map((pillar) => ({
      title: pillar.title,
      description: pillar.description,
    })),
    writingStyleRules: voice.writingStyleRules,
    audienceRules: voice.audienceRules.map((rule) => ({
      audience: rule.audience,
      rules: rule.rules,
    })),
    approvedExamples: voice.approvedExamples.map((example) => ({ phrase: example.phrase })),
    rejectedExamples: voice.rejectedExamples.map((example) => ({
      phrase: example.phrase,
      reason: example.reason,
    })),
  };
}

export function useBrandVoiceForm(
  brandId: string,
  onDirtyChange?: (dirty: boolean) => void,
): UseBrandVoiceFormReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines.voice!;
  const toast = useToast();
  const { voiceQuery, updateMutation } = useBrandVoiceRepository(brandId);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpsertBrandVoiceInput>({
    defaultValues: EMPTY_DEFAULTS,
    resolver: upsertBrandVoiceResolver,
    mode: 'onSubmit',
  });

  const resetSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceQuery.isSuccess) return;
    const voice = voiceQuery.data ?? null;
    const signature = voice
      ? `${voice.brandId}::${voice.updatedAt.toISOString()}`
      : `${brandId}::empty`;
    if (resetSignatureRef.current === signature) return;
    resetSignatureRef.current = signature;
    form.reset(toFormValues(voice));
  }, [brandId, voiceQuery.isSuccess, voiceQuery.data, form]);

  const { isDirty } = useFormState({ control: form.control });
  useEffect(() => {
    if (!onDirtyChange) return;
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = useCallback(
    async (event?: React.BaseSyntheticEvent): Promise<void> => {
      setFormError(null);
      await form.handleSubmit(async (values) => {
        try {
          await updateMutation.mutateAsync(values);
          toast.success(labels.toast.success);
          if (onDirtyChange) onDirtyChange(false);
        } catch (error) {
          if (isApiErrorEnvelope(error)) {
            const body = error.data.error;
            const fieldErrors = body.errors ?? [];
            fieldErrors.forEach((entry) => {
              form.setError(entry.field as keyof UpsertBrandVoiceInput, {
                type: 'server',
                message: entry.message,
              });
            });
            setFormError(body.message);
          } else {
            setFormError(labels.toast.error);
          }
          toast.error(labels.toast.error);
        }
      })(event);
    },
    [form, updateMutation, toast, labels.toast.success, labels.toast.error, onDirtyChange],
  );

  const status: 'loading' | 'ready' = voiceQuery.isLoading ? 'loading' : 'ready';
  const uiModel = mapToBrandVoiceFormUIModel({
    translations: labels,
    status,
    isSubmitting: updateMutation.isPending,
    submitDisabled: updateMutation.isPending || voiceQuery.isLoading,
    formError,
  });

  return { uiModel, form, handleSubmit };
}
