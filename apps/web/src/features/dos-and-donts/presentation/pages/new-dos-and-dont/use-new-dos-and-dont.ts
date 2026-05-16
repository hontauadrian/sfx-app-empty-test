'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useCreateDosAndDontMutation } from '../../../data/repositories/use-create-dos-and-dont-mutation';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';
import { mapToNewDosAndDontPageUIModel } from './map-to-new-dos-and-dont-page-ui-model';
import type {
  NewDosAndDontNavigationTarget,
  UseNewDosAndDontReturn,
} from './types';

export function useNewDosAndDont(brandId: string): UseNewDosAndDontReturn {
  const translations = useTranslations('common');
  const mutation = useCreateDosAndDontMutation(brandId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<NewDosAndDontNavigationTarget>(null);

  const handleSubmit = useCallback(
    async (values: DosAndDontFormValues): Promise<void> => {
      setServerError(null);
      try {
        await mutation.mutateAsync({
          type: values.type,
          category: values.category,
          title: values.title,
          body: values.body,
          suggestedCorrection: values.suggestedCorrection ?? null,
        });
        setNavigationTarget('saved');
      } catch (error) {
        setServerError(
          error instanceof Error
            ? error.message
            : translations.dosAndDontSaveError,
        );
      }
    },
    [mutation, translations.dosAndDontSaveError],
  );

  const handleCancel = useCallback((): void => {
    setNavigationTarget('cancel');
  }, []);

  const clearNavigationTarget = useCallback((): void => {
    setNavigationTarget(null);
  }, []);

  const uiModel = mapToNewDosAndDontPageUIModel({ translations, serverError });

  return {
    uiModel,
    handleSubmit,
    handleCancel,
    navigationTarget,
    clearNavigationTarget,
    isSubmitting: mutation.isPending,
  };
}
