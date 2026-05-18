import type { DosDontsCategory, DosDontsType } from '@sfx/domain';

export interface DosAndDontsListProps {
  readonly brandId: string;
  readonly focusEntryId?: string | null;
}

export interface DosDontsFilterState {
  readonly type: DosDontsType | '';
  readonly category: DosDontsCategory | '';
}
