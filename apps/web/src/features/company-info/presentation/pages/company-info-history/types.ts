import type { CompanyInfoDeniedUIModel } from '../company-info/types';

export type CompanyInfoHistoryPageStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'denied'
  | 'error';

export interface CompanyInfoHistoryRowUIModel {
  readonly id: string;
  readonly href: string;
  readonly savedAtLabel: string;
  readonly editorLabel: string;
  readonly ariaLabel: string;
}

export interface CompanyInfoHistoryColumnHeadersUIModel {
  readonly savedAt: string;
  readonly editor: string;
}

export interface CompanyInfoHistoryEmptyUIModel {
  readonly title: string;
  readonly message: string;
}

export interface CompanyInfoHistoryErrorUIModel {
  readonly title: string;
  readonly message: string;
}

export interface CompanyInfoHistoryBackToCurrentUIModel {
  readonly label: string;
  readonly href: string;
}

export interface CompanyInfoHistoryPageUIModel {
  readonly status: CompanyInfoHistoryPageStatus;
  readonly title: string;
  readonly loadingLabel: string;
  readonly columnHeaders: CompanyInfoHistoryColumnHeadersUIModel;
  readonly rows: readonly CompanyInfoHistoryRowUIModel[];
  readonly empty: CompanyInfoHistoryEmptyUIModel;
  readonly error: CompanyInfoHistoryErrorUIModel;
  readonly denied: CompanyInfoDeniedUIModel;
  readonly backToCurrent: CompanyInfoHistoryBackToCurrentUIModel;
}

export interface UseCompanyInfoHistoryReturn {
  readonly uiModel: CompanyInfoHistoryPageUIModel;
}
