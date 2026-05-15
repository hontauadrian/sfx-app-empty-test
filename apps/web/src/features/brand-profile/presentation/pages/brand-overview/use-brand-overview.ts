'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { useBrandByIdRepository } from '../../../data/repositories/use-brand-by-id-repository';
import { useUpdateBrandMutation } from '../../../data/repositories/use-update-brand-mutation';
import { useDeleteBrandMutation } from '../../../data/repositories/use-delete-brand-mutation';
import { DASHBOARD_ROUTE } from '../../../constants';
import { mapToBrandOverviewPageUIModel } from './map-to-brand-overview-page-ui-model';
import type { UseBrandOverviewReturn } from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (typeof error !== 'object') return false;
  const candidate = error as ErrorWithStatus;
  return candidate.status === 404;
}

export function useBrandOverview(brandId: string): UseBrandOverviewReturn {
  const translations = useTranslations('common');
  const router = useRouter();
  const activeBrandId = useActiveBrandStore((state) => state.activeBrandId);
  const clearStore = useActiveBrandStore((state) => state.clear);
  const query = useBrandByIdRepository(brandId);
  const updateMutation = useUpdateBrandMutation();
  const deleteMutation = useDeleteBrandMutation();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const openRename = useCallback((): void => setIsRenameOpen(true), []);
  const closeRename = useCallback((): void => setIsRenameOpen(false), []);
  const openDelete = useCallback((): void => setIsDeleteOpen(true), []);
  const closeDelete = useCallback((): void => setIsDeleteOpen(false), []);

  const handleRenameSubmit = useCallback(
    async (name: string): Promise<void> => {
      await updateMutation.mutateAsync({ id: brandId, name });
      setIsRenameOpen(false);
    },
    [brandId, updateMutation],
  );

  const handleDeleteConfirm = useCallback(async (): Promise<void> => {
    await deleteMutation.mutateAsync(brandId);
    setIsDeleteOpen(false);
    if (activeBrandId === brandId) {
      clearStore();
      router.push(DASHBOARD_ROUTE);
    }
  }, [deleteMutation, brandId, activeBrandId, clearStore, router]);

  const uiModel = mapToBrandOverviewPageUIModel({
    translations,
    brand: query.data,
    brandId,
    isLoading: query.isLoading,
    isError: query.isError,
    notFound: query.isError && isNotFound(query.error),
  });

  return {
    uiModel,
    isRenameOpen,
    isDeleteOpen,
    isRenaming: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    initialName: query.data?.name ?? '',
    openRename,
    closeRename,
    openDelete,
    closeDelete,
    handleRenameSubmit,
    handleDeleteConfirm,
  };
}
