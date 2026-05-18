'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useFormState } from 'react-hook-form';
import type { UpsertVisualIdentityInput, VisualIdentity } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast/use-toast';
import { useVisualIdentityRepository } from '../../../data/repositories/use-visual-identity-repository';
import { upsertVisualIdentityResolver } from '../../validators/upsert-visual-identity.resolver';
import { mapToVisualIdentityFormUIModel } from './map-to-visual-identity-form-ui-model';
import type { UseVisualIdentityFormReturn } from './types';

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

const EMPTY_DEFAULTS: UpsertVisualIdentityInput = {
  logoUsage: '',
  colorPalette: [],
  typography: [],
  spacingGuidance: '',
  imageStyleGuidance: '',
  iconographyGuidance: '',
  usageRestrictions: '',
};

function toFormValues(value: VisualIdentity | null): UpsertVisualIdentityInput {
  if (!value) return EMPTY_DEFAULTS;
  return {
    logoUsage: value.logoUsage,
    colorPalette: value.colorPalette.map((entry) => ({
      name: entry.name,
      hex: entry.hex,
      usageNotes: entry.usageNotes,
    })),
    typography: value.typography.map((entry) => ({
      font: entry.font,
      weight: entry.weight,
      usageContext: entry.usageContext,
    })),
    spacingGuidance: value.spacingGuidance,
    imageStyleGuidance: value.imageStyleGuidance,
    iconographyGuidance: value.iconographyGuidance,
    usageRestrictions: value.usageRestrictions,
  };
}

export function useVisualIdentityForm(
  brandId: string,
  onDirtyChange?: (dirty: boolean) => void,
): UseVisualIdentityFormReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines.visual!;
  const toast = useToast();
  const { visualQuery, updateMutation } = useVisualIdentityRepository(brandId);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpsertVisualIdentityInput>({
    defaultValues: EMPTY_DEFAULTS,
    resolver: upsertVisualIdentityResolver,
    mode: 'onSubmit',
  });

  const resetSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visualQuery.isSuccess) return;
    const value = visualQuery.data ?? null;
    const signature = value
      ? `${value.brandId}::${value.updatedAt.toISOString()}`
      : `${brandId}::empty`;
    if (resetSignatureRef.current === signature) return;
    resetSignatureRef.current = signature;
    form.reset(toFormValues(value));
  }, [brandId, visualQuery.isSuccess, visualQuery.data, form]);

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
              form.setError(entry.field as keyof UpsertVisualIdentityInput, {
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

  const status: 'loading' | 'ready' = visualQuery.isLoading ? 'loading' : 'ready';
  const uiModel = mapToVisualIdentityFormUIModel({
    translations: labels,
    status,
    isSubmitting: updateMutation.isPending,
    submitDisabled: updateMutation.isPending || visualQuery.isLoading,
    formError,
  });

  return { uiModel, form, handleSubmit };
}
