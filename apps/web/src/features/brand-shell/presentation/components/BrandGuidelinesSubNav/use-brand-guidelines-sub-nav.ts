'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import {
  BRAND_GUIDELINES_SUB_NAV_REGISTRY,
  type BrandGuidelinesSubNavEntry,
} from '../../../constants';
import { mapToBrandGuidelinesSubNavUIModel } from './map-to-brand-guidelines-sub-nav-ui-model';
import type { BrandGuidelinesSubNavUIModel } from './types';

export interface UseBrandGuidelinesSubNavReturn {
  readonly uiModel: BrandGuidelinesSubNavUIModel;
  readonly handleSelectTab: (id: string) => void;
  readonly handleDirtyChange: (id: string, dirty: boolean) => void;
}

export interface UseBrandGuidelinesSubNavInput {
  readonly renderBody: (entry: BrandGuidelinesSubNavEntry) => ReactNode;
  readonly confirmFn?: (message: string) => boolean;
}

const DEFAULT_ACTIVE_ID = BRAND_GUIDELINES_SUB_NAV_REGISTRY[0]?.id ?? 'voice';

export function useBrandGuidelinesSubNav(
  input: UseBrandGuidelinesSubNavInput,
): UseBrandGuidelinesSubNavReturn {
  const translations = useTranslations('common');
  const subNav = translations.adminBrandGuidelines.subNav!;

  const [activeId, setActiveId] = useState<string>(DEFAULT_ACTIVE_ID);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});

  const handleSelectTab = useCallback(
    (nextId: string): void => {
      if (nextId === activeId) return;
      const currentDirty = dirtyMap[activeId] === true;
      const confirm =
        input.confirmFn ??
        (typeof window !== 'undefined' ? window.confirm.bind(window) : (): boolean => true);
      if (currentDirty && !confirm(subNav.unsavedChangesWarning)) {
        return;
      }
      setActiveId(nextId);
    },
    [activeId, dirtyMap, input.confirmFn, subNav.unsavedChangesWarning],
  );

  const handleDirtyChange = useCallback((entryId: string, dirty: boolean): void => {
    setDirtyMap((prev) => {
      if (prev[entryId] === dirty) return prev;
      return { ...prev, [entryId]: dirty };
    });
  }, []);

  const uiModel = mapToBrandGuidelinesSubNavUIModel({
    activeId,
    labels: subNav,
    renderBody: input.renderBody,
    navAriaLabel: translations.adminBrandGuidelines.pageTitle,
  });

  return { uiModel, handleSelectTab, handleDirtyChange };
}
