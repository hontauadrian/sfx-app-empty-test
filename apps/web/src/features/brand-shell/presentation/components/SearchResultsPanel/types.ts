import type { GuidelineSearchResult } from '@sfx/domain';

export interface SearchResultsPanelProps {
  readonly query: string;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly result: GuidelineSearchResult | undefined;
}
