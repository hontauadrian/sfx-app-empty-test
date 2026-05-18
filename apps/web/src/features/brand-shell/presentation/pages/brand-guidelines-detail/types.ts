import type { Brand } from '@sfx/domain';

export interface BrandGuidelinesDetailPageProps {
  readonly brandId: string;
}

export type BrandGuidelinesDetailNavigationTarget =
  | { readonly kind: 'detail'; readonly brandId: string }
  | { readonly kind: 'empty' }
  | null;

export type BrandGuidelinesDetailStatus =
  | 'loading'
  | 'not-found'
  | 'ready';

export interface BrandGuidelinesDetailNotFoundUIModel {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
  readonly backHref: string;
}

export interface BrandGuidelinesDetailPlaceholderUIModel {
  readonly title: string;
  readonly message: string;
}

export interface BrandGuidelinesDetailUIModel {
  readonly status: BrandGuidelinesDetailStatus;
  readonly pageTitle: string;
  readonly notFound: BrandGuidelinesDetailNotFoundUIModel;
  readonly placeholder: BrandGuidelinesDetailPlaceholderUIModel;
  readonly activeBrandName: string;
  readonly auditLogCtaLabel: string;
}

export interface UseBrandGuidelinesDetailReturn {
  readonly uiModel: BrandGuidelinesDetailUIModel;
  readonly brands: readonly Brand[];
  readonly activeBrand: Brand | null;
  readonly navigationTarget: BrandGuidelinesDetailNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly handleSelectBrand: (id: string) => void;
  readonly handleCreated: (brand: Brand) => void;
  readonly handleRenamed: (brand: Brand) => void;
  readonly handleDeleted: (id: string) => void;
  readonly searchQuery: string;
  readonly setSearchQuery: (next: string) => void;
}
