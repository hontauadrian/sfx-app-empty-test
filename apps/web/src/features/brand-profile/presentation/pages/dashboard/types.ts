export interface DashboardPageUIModel {
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly emptyStateTitle: string;
  readonly emptyStateBody: string;
  readonly emptyStateCtaLabel: string;
  readonly emptyStateCtaHref: string;
  readonly showEmptyState: boolean;
  readonly redirectTo: string | null;
  readonly loadingLabel: string;
  readonly errorLabel: string;
}

export interface UseDashboardReturn {
  readonly uiModel: DashboardPageUIModel;
}
