'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { useCreateBrandMutation } from '../../../data/repositories/use-create-brand-mutation';
import { brandRoute, DASHBOARD_ROUTE } from '../../../constants';
import { mapToNewBrandPageUIModel } from './map-to-new-brand-page-ui-model';
import type { BrandProfileFormValues } from '../../validators/brand-profile-form';
import type { UseNewBrandReturn } from './types';

export function useNewBrand(): UseNewBrandReturn {
  const translations = useTranslations('common');
  const router = useRouter();
  const setActiveBrandId = useActiveBrandStore((state) => state.setActiveBrandId);
  const mutation = useCreateBrandMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (values: BrandProfileFormValues): Promise<void> => {
      setServerError(null);
      try {
        const created = await mutation.mutateAsync({
          name: values.name,
          description: values.description ?? null,
        });
        setActiveBrandId(created.id);
        router.push(brandRoute(created.id));
      } catch (error) {
        setServerError(error instanceof Error ? error.message : translations.error);
      }
    },
    [mutation, router, setActiveBrandId, translations.error],
  );

  const handleCancel = useCallback((): void => {
    router.push(DASHBOARD_ROUTE);
  }, [router]);

  const uiModel = mapToNewBrandPageUIModel({
    translations,
    isSubmitting: mutation.isPending,
    serverError,
  });

  return { uiModel, handleSubmit, handleCancel };
}
