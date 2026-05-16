'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useDosAndDontByIdRepository } from '../../../data/repositories/use-dos-and-dont-by-id-repository';
import { useUpdateDosAndDontMutation } from '../../../data/repositories/use-update-dos-and-dont-mutation';
import type { DosAndDontFormValues } from '../../validators/dos-and-dont-form';
import { mapToEditDosAndDontPageUIModel } from './map-to-edit-dos-and-dont-page-ui-model';
import type {
  EditDosAndDontNavigationTarget,
  UseEditDosAndDontReturn,
} from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

export function useEditDosAndDont(
  brandId: string,
  entryId: string,
): UseEditDosAndDontReturn {
  const translations = useTranslations('common');
  const query = useDosAndDontByIdRepository(brandId, entryId);
  const mutation = useUpdateDosAndDontMutation(brandId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<EditDosAndDontNavigationTarget>(null);

  const handleSubmit = useCallback(
    async (values: DosAndDontFormValues): Promise<void> => {
      setServerError(null);
      try {
        await mutation.mutateAsync({
          entryId,
          payload: {
            type: values.type,
            category: values.category,
            title: values.title,
            body: values.body,
            suggestedCorrection: values.suggestedCorrection ?? null,
          },
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
    [mutation, entryId, translations.dosAndDontSaveError],
  );

  const handleCancel = useCallback((): void => {
    setNavigationTarget('cancel');
  }, []);

  const clearNavigationTarget = useCallback((): void => {
    setNavigationTarget(null);
  }, []);

  const notFound = query.isError && isNotFound(query.error);
  const uiModel = mapToEditDosAndDontPageUIModel({
    translations,
    entry: query.data,
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
