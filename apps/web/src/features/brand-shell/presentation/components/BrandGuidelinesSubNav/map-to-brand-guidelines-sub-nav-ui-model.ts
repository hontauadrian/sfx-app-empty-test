import type { ReactNode } from 'react';
import type { AdminBrandGuidelinesSubNavTranslations } from '@/features/presentation/localization/types';
import {
  BRAND_GUIDELINES_SUB_NAV_REGISTRY,
  type BrandGuidelinesSubNavEntry,
} from '../../../constants';
import type {
  BrandGuidelinesSubNavTabUIModel,
  BrandGuidelinesSubNavUIModel,
} from './types';

export interface MapToBrandGuidelinesSubNavUIModelInput {
  readonly activeId: string;
  readonly labels: AdminBrandGuidelinesSubNavTranslations;
  readonly renderBody: (entry: BrandGuidelinesSubNavEntry) => ReactNode;
  readonly navAriaLabel: string;
}

export function mapToBrandGuidelinesSubNavUIModel(
  input: MapToBrandGuidelinesSubNavUIModelInput,
): BrandGuidelinesSubNavUIModel {
  const sorted = [...BRAND_GUIDELINES_SUB_NAV_REGISTRY].sort(
    (first, second) => first.slot - second.slot,
  );
  const tabs: readonly BrandGuidelinesSubNavTabUIModel[] = sorted.map((entry) => ({
    id: entry.id,
    label: input.labels[entry.labelKey],
    isActive: entry.id === input.activeId,
    slot: entry.slot,
  }));
  const activeEntry = sorted.find((entry) => entry.id === input.activeId) ?? sorted[0];
  return {
    tabs,
    activeBody: activeEntry ? input.renderBody(activeEntry) : null,
    activeId: activeEntry?.id ?? '',
    navAriaLabel: input.navAriaLabel,
  };
}
