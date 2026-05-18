'use client';

import { useCallback, useState } from 'react';
import type { Brand } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import {
  CREATE_NEW_OPTION_VALUE,
  mapToBrandProfileSelectorUIModel,
} from './map-to-brand-profile-selector-ui-model';
import type { BrandProfileSelectorProps, BrandProfileSelectorUIModel } from './types';

interface UseBrandProfileSelectorReturn {
  readonly uiModel: BrandProfileSelectorUIModel;
  readonly createOpen: boolean;
  readonly renameOpen: boolean;
  readonly deleteOpen: boolean;
  readonly activeBrand: Brand | null;
  readonly handleSelectChange: (value: string) => void;
  readonly handleOpenRename: () => void;
  readonly handleOpenDelete: () => void;
  readonly handleCloseCreate: () => void;
  readonly handleCloseRename: () => void;
  readonly handleCloseDelete: () => void;
  readonly handleCreated: (brand: Brand) => void;
  readonly handleRenamed: (brand: Brand) => void;
  readonly handleDeleted: (id: string) => void;
}

export function useBrandProfileSelector(
  props: BrandProfileSelectorProps,
): UseBrandProfileSelectorReturn {
  const translations = useTranslations('common');
  const labels = translations.adminBrandGuidelines;
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const activeBrand: Brand | null =
    props.brands.find((brand) => brand.id === props.activeBrandId) ?? null;

  const uiModel = mapToBrandProfileSelectorUIModel({
    labels,
    brands: props.brands,
    activeBrandId: props.activeBrandId,
  });

  const handleSelectChange = useCallback(
    (value: string) => {
      if (value === CREATE_NEW_OPTION_VALUE) {
        setCreateOpen(true);
        return;
      }
      if (value !== '' && value !== props.activeBrandId) {
        props.onSelectBrand(value);
      }
    },
    [props],
  );

  const handleOpenRename = useCallback(() => {
    if (activeBrand) setRenameOpen(true);
  }, [activeBrand]);

  const handleOpenDelete = useCallback(() => {
    if (activeBrand) setDeleteOpen(true);
  }, [activeBrand]);

  const handleCloseCreate = useCallback(() => setCreateOpen(false), []);
  const handleCloseRename = useCallback(() => setRenameOpen(false), []);
  const handleCloseDelete = useCallback(() => setDeleteOpen(false), []);

  const handleCreated = useCallback(
    (brand: Brand) => {
      props.onCreated(brand);
    },
    [props],
  );
  const handleRenamed = useCallback(
    (brand: Brand) => {
      props.onRenamed(brand);
    },
    [props],
  );
  const handleDeleted = useCallback(
    (id: string) => {
      props.onDeleted(id);
    },
    [props],
  );

  return {
    uiModel,
    createOpen,
    renameOpen,
    deleteOpen,
    activeBrand,
    handleSelectChange,
    handleOpenRename,
    handleOpenDelete,
    handleCloseCreate,
    handleCloseRename,
    handleCloseDelete,
    handleCreated,
    handleRenamed,
    handleDeleted,
  };
}
