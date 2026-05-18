export type BrandGuidelinesHistoryStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'denied'
  | 'not-found'
  | 'error';

export interface BrandGuidelinesHistoryRowUIModel {
  readonly id: string;
  readonly href: string;
  readonly savedAtLabel: string;
  readonly editorLabel: string;
  readonly changeNoteLabel: string | null;
  readonly ariaLabel: string;
}

export interface BrandGuidelinesHistoryEmptyUIModel {
  readonly title: string;
  readonly message: string;
}

export interface BrandGuidelinesHistoryFeedbackUIModel {
  readonly title: string;
  readonly message: string;
}

export interface BrandGuidelinesHistoryColumnHeadersUIModel {
  readonly savedAt: string;
  readonly editor: string;
  readonly changeNote: string;
}

export interface BrandGuidelinesHistoryBackLinkUIModel {
  readonly label: string;
  readonly href: string;
}

export interface BrandGuidelinesHistoryPageUIModel {
  readonly status: BrandGuidelinesHistoryStatus;
  readonly title: string;
  readonly columnHeaders: BrandGuidelinesHistoryColumnHeadersUIModel;
  readonly rows: readonly BrandGuidelinesHistoryRowUIModel[];
  readonly empty: BrandGuidelinesHistoryEmptyUIModel;
  readonly error: BrandGuidelinesHistoryFeedbackUIModel;
  readonly denied: BrandGuidelinesHistoryFeedbackUIModel;
  readonly notFound: BrandGuidelinesHistoryFeedbackUIModel;
  readonly backToCurrent: BrandGuidelinesHistoryBackLinkUIModel;
  readonly loadingLabel: string;
  readonly emptyChangeNote: string;
}

export interface BrandGuidelinesHistoryPageProps {
  readonly brandId: string;
}
