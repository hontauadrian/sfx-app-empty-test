'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { useBrandsRepository } from '@/features/brand-profile/data/repositories/use-brands-repository';
import {
  CONTENT_CHECK_CATEGORY_ALL_VALUE,
} from '../../../constants';
import {
  contentCheckFormResolverSchema,
  type ContentCheckFormValues,
} from '../../validators/content-check-form';
import { useContentCheckListRepository } from '@/features/content-check/data/repositories/use-content-check-list-repository';
import { groupEntries } from '../../helpers/group-entries';
import { mapToContentCheckPageUIModel } from './map-to-content-check-page-ui-model';
import type { UseContentCheckReturn } from './types';

export function useContentCheck(): UseContentCheckReturn {
  const translations = useTranslations('common');
  const activeBrandId = useActiveBrandStore((state) => state.activeBrandId);
  const clearActiveBrand = useActiveBrandStore((state) => state.clear);
  const brandsQuery = useBrandsRepository();

  const form = useForm<ContentCheckFormValues>({
    resolver: zodResolver(
      contentCheckFormResolverSchema as unknown as Parameters<typeof zodResolver>[0],
    ),
    defaultValues: {
      pastedText: '',
      category: CONTENT_CHECK_CATEGORY_ALL_VALUE,
    },
  });

  const formCategory = useWatch({
    control: form.control,
    name: 'category',
    defaultValue: CONTENT_CHECK_CATEGORY_ALL_VALUE,
  });
  const pastedTextValue = useWatch({
    control: form.control,
    name: 'pastedText',
    defaultValue: '',
  });

  const repo = useContentCheckListRepository(activeBrandId, formCategory);

  useEffect(() => {
    if (repo.isBrandNotFound && activeBrandId !== null) {
      clearActiveBrand();
    }
  }, [repo.isBrandNotFound, activeBrandId, clearActiveBrand]);

  const activeBrandName = useMemo(() => {
    if (activeBrandId === null) return null;
    const brands = brandsQuery.data ?? [];
    return brands.find((entry) => entry.id === activeBrandId)?.name ?? null;
  }, [activeBrandId, brandsQuery.data]);

  const groupedEntries = useMemo(() => {
    return repo.data ? groupEntries(repo.data) : [];
  }, [repo.data]);

  const uiModel = mapToContentCheckPageUIModel({
    translations,
    activeBrandId,
    activeBrandName,
    isLoading: repo.isLoading,
    isError: repo.isError,
    isBrandNotFound: repo.isBrandNotFound,
    entries: groupedEntries,
    pastedTextValue: pastedTextValue ?? '',
  });

  const handleCheckContent = useCallback((): void => {
    // The category select drives the React Query key, so clicking the CTA is a
    // no-op re-render. Wrapped for stable identity per the hook return audit.
  }, []);

  return {
    uiModel,
    register: form.register,
    handleSubmit: form.handleSubmit,
    handleCheckContent,
    formErrors: form.formState.errors,
  };
}
