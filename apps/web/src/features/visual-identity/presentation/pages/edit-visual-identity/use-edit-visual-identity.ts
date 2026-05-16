'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useVisualIdentityRepository } from '../../../data/repositories/use-visual-identity-repository';
import { useUpsertVisualIdentityMutation } from '../../../data/repositories/use-upsert-visual-identity-mutation';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';
import { mapToEditVisualIdentityPageUIModel } from './map-to-edit-visual-identity-page-ui-model';
import type {
  EditVisualIdentityNavigationTarget,
  UseEditVisualIdentityReturn,
} from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

export function useEditVisualIdentity(brandId: string): UseEditVisualIdentityReturn {
  const translations = useTranslations('common');
  const query = useVisualIdentityRepository(brandId);
  const mutation = useUpsertVisualIdentityMutation(brandId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<EditVisualIdentityNavigationTarget>(null);

  const handleSubmit = useCallback(
    async (values: VisualIdentityFormValues): Promise<void> => {
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
  const uiModel = mapToEditVisualIdentityPageUIModel({
    translations,
    identity: query.data,
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
