'use client';

import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { Brand } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import { renameBrandResolver } from '../../validators/rename-brand.resolver';
import { mapToRenameBrandDialogUIModel } from './map-to-rename-brand-dialog-ui-model';
import type { RenameBrandDialogProps, RenameBrandDialogUIModel } from './types';

interface UseRenameBrandDialogReturn {
  readonly uiModel: RenameBrandDialogUIModel;
  readonly nameValue: string;
  readonly handleNameChange: (value: string) => void;
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancel: () => void;
}

export function useRenameBrandDialog(
  props: RenameBrandDialogProps,
): UseRenameBrandDialogReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const { renameMutation } = useBrandsRepository();
  const toast = useToast();

  const form = useForm<{ name: string }>({
    resolver: renameBrandResolver,
    defaultValues: { name: props.brand?.name ?? '' },
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (props.open && props.brand) {
      form.reset({ name: props.brand.name });
    } else if (!props.open) {
      form.reset({ name: '' });
    }
  }, [props.open, props.brand, form]);

  const nameError = form.formState.errors.name?.message ?? null;
  const pending = renameMutation.isPending;

  const uiModel = mapToRenameBrandDialogUIModel({
    labels,
    nameError,
    pending,
  });

  const handleNameChange = useCallback(
    (value: string) => {
      form.setValue('name', value, { shouldDirty: true, shouldValidate: false });
    },
    [form],
  );

  const completeWithBrand = useCallback(
    (brand: Brand) => {
      toast.success(labels.toast.renameSuccess);
      props.onRenamed(brand);
      props.onClose();
    },
    [labels.toast.renameSuccess, props, toast],
  );

  const handleSubmit = useCallback(async () => {
    const currentBrand = props.brand;
    if (!currentBrand) return;
    await form.handleSubmit(async (values) => {
      try {
        const saved = await renameMutation.mutateAsync({ id: currentBrand.id, name: values.name });
        completeWithBrand(saved);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 400) {
          form.setError('name', { message: labels.validation.nameRequired });
          return;
        }
        if (status === 404) {
          toast.error(labels.toast.unexpectedError);
          props.onClose();
          return;
        }
        if (status === 401 || status === 403) {
          toast.error(labels.toast.authError);
          return;
        }
        toast.error(labels.toast.unexpectedError);
      }
    })();
  }, [completeWithBrand, form, labels, props, renameMutation, toast]);

  const handleCancel = useCallback(() => {
    props.onClose();
  }, [props]);

  return {
    uiModel,
    nameValue: form.watch('name'),
    handleNameChange,
    handleSubmit,
    handleCancel,
  };
}
