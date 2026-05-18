import type { ReactNode } from 'react';

export interface BrandGuidelinesSubNavProps {
  readonly activeBrandId: string;
}

export interface BrandGuidelinesSubNavTabUIModel {
  readonly id: string;
  readonly label: string;
  readonly isActive: boolean;
  readonly slot: number;
}

export interface BrandGuidelinesSubNavUIModel {
  readonly tabs: readonly BrandGuidelinesSubNavTabUIModel[];
  readonly activeBody: ReactNode;
  readonly activeId: string;
  readonly navAriaLabel: string;
}
