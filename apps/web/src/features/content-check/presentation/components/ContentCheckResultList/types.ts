import type { ContentCheckResultGroup } from '../../pages/content-check/types';

export interface ContentCheckResultListProps {
  readonly resultsTitle: string;
  readonly suggestedCorrectionLabel: string;
  readonly groups: readonly ContentCheckResultGroup[];
}
