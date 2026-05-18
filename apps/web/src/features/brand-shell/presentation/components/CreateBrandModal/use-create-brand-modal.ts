'use client';

import { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { Brand } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { useBrandsRepository } from '../../../data/repositories/use-brands-repository';
import { createBrandResolver } from '../../validators/create-brand.resolver';
import { mapToCreateBrandModalUIModel } from './map-to-create-brand-modal-ui-model';
import type { CreateBrandModalProps, CreateBrandModalUIModel } from './types';

interface UseCreateBrandModalReturn {
  readonly uiModel: CreateBrandModalUIModel;
  readonly nameValue: string;
  readonly handleNameChange: (value: string) => void;
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancel: () => void;
}

export function useCreateBrandModal(props: CreateBrandModalProps): UseCreateBrandModalReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const { createMutation } = useBrandsRepository();
  const toast = useToast();

  const form = useForm<{ name: string }>({
    resolver: createBrandResolver,
    defaultValues: { name: '' },
    mode: 'onSubmit',
  });

  useEffect(() => {
    if (!props.open) {
      form.reset({ name: '' });
    }
  }, [props.open, form]);

  const nameError = form.formState.errors.name?.message ?? null;
  const pending = createMutation.isPending;

  const uiModel = mapToCreateBrandModalUIModel({
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

  const submitWithBrand = useCallback(
    (brand: Brand) => {
      toast.success(labels.toast.createSuccess);
      props.onCreated(brand);
      props.onClose();
    },
    [labels.toast.createSuccess, props, toast],
  );

  const handleSubmit = useCallback(async () => {
    await form.handleSubmit(async (values) => {
      try {
        const brand = await createMutation.mutateAsync({ name: values.name });
        submitWithBrand(brand);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 400) {
          form.setError('name', { message: labels.validation.nameRequired });
          return;
        }
        if (status === 401 || status === 403) {
          toast.error(labels.toast.authError);
          return;
        }
        toast.error(labels.toast.unexpectedError);
      }
    })();
  }, [createMutation, form, labels, submitWithBrand, toast]);

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
