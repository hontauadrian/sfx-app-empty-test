export type BrandGuidelinesEmptyNavigationTarget =
  | { readonly kind: 'detail'; readonly brandId: string }
  | null;

export interface BrandGuidelinesEmptyUIModel {
  readonly status: 'loading' | 'ready';
  readonly pageTitle: string;
  readonly emptyTitle: string;
  readonly emptyMessage: string;
  readonly createCtaLabel: string;
}

export interface UseBrandGuidelinesEmptyReturn {
  readonly uiModel: BrandGuidelinesEmptyUIModel;
  readonly createOpen: boolean;
  readonly navigationTarget: BrandGuidelinesEmptyNavigationTarget;
  readonly clearNavigationTarget: () => void;
  readonly handleOpenCreate: () => void;
  readonly handleCloseCreate: () => void;
  readonly handleCreated: (brandId: string) => void;
}
