'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useBrandVoiceRepository } from '../../../data/repositories/use-brand-voice-repository';
import { useUpsertBrandVoiceMutation } from '../../../data/repositories/use-upsert-brand-voice-mutation';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';
import { mapToVoiceEditPageUIModel } from './map-to-voice-edit-page-ui-model';
import type { UseVoiceEditReturn, VoiceEditNavigationTarget } from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

export function useVoiceEdit(brandId: string): UseVoiceEditReturn {
  const translations = useTranslations('common');
  const query = useBrandVoiceRepository(brandId);
  const mutation = useUpsertBrandVoiceMutation(brandId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<VoiceEditNavigationTarget>(null);

  const handleSubmit = useCallback(
    async (values: BrandVoiceFormValues): Promise<void> => {
      setServerError(null);
      try {
        await mutation.mutateAsync(values);
        setNavigationTarget('saved');
      } catch (error) {
        setServerError(error instanceof Error ? error.message : translations.error);
      }
    },
    [mutation, translations.error],
  );

  const handleCancel = useCallback((): void => {
    setNavigationTarget('cancel');
  }, []);

  const clearNavigationTarget = useCallback((): void => {
    setNavigationTarget(null);
  }, []);

  const notFound = query.isError && isNotFound(query.error);
  const uiModel = mapToVoiceEditPageUIModel({
    translations,
    voice: query.data,
    isLoading: query.isLoading,
    notFound,
    hasError: query.isError && !notFound,
    serverError,
  });

  return {
    uiModel,
    handleSubmit,
    handleCancel,
    navigationTarget,
    clearNavigationTarget,
    isSubmitting: mutation.isPending,
  };
}
