export interface HomePageUIModel {
  readonly title: string;
  readonly healthLabel: string;
  readonly statusText: string;
  readonly isLoading: boolean;
  readonly isHealthy: boolean;
  readonly isError: boolean;
  readonly ctaLabel: string;
  readonly ctaHref: string;
}

export interface UseHomeReturn {
  readonly uiModel: HomePageUIModel;
}
