'use client';

import { useCallback } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import { mapToDeleteBrandConfirmUIModel } from './map-to-delete-brand-confirm-ui-model';
import type { DeleteBrandConfirmProps, DeleteBrandConfirmUIModel } from './types';

interface UseDeleteBrandConfirmReturn {
  readonly uiModel: DeleteBrandConfirmUIModel;
  readonly handleConfirm: () => Promise<void>;
  readonly handleCancel: () => void;
}

export function useDeleteBrandConfirm(
  props: DeleteBrandConfirmProps,
): UseDeleteBrandConfirmReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const { deleteMutation } = useBrandsRepository();
  const toast = useToast();

  const pending = deleteMutation.isPending;
  const brandName = props.brand?.name ?? '';
  const uiModel = mapToDeleteBrandConfirmUIModel({ labels, brandName, pending });

  const handleConfirm = useCallback(async () => {
    const brand = props.brand;
    if (!brand) return;
    try {
      await deleteMutation.mutateAsync({ id: brand.id });
      toast.success(labels.toast.deleteSuccess);
      props.onDeleted(brand.id);
      props.onClose();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 404) {
        toast.success(labels.toast.deleteSuccess);
        props.onDeleted(brand.id);
        props.onClose();
        return;
      }
      if (status === 401 || status === 403) {
        toast.error(labels.toast.authError);
        return;
      }
      toast.error(labels.toast.unexpectedError);
    }
  }, [deleteMutation, labels, props, toast]);

  const handleCancel = useCallback(() => {
    props.onClose();
  }, [props]);

  return { uiModel, handleConfirm, handleCancel };
}
