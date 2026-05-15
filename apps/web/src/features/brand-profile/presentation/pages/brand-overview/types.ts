export interface BrandOverviewPageProps {
  readonly brandId: string;
}

export interface BrandOverviewPageUIModel {
  readonly brandName: string;
  readonly isLoading: boolean;
  readonly hasError: boolean;
  readonly notFound: boolean;
  readonly errorLabel: string;
  readonly settingsLabel: string;
  readonly renameLabel: string;
  readonly deleteLabel: string;
  readonly brandVoiceTitle: string;
  readonly brandVoiceCtaLabel: string;
  readonly brandVoiceCtaHref: string;
  readonly visualIdentityTitle: string;
  readonly visualIdentityCtaLabel: string;
  readonly visualIdentityCtaHref: string;
  readonly renameModalTitle: string;
  readonly renameSubmitLabel: string;
  readonly renameCancelLabel: string;
  readonly renameNameLabel: string;
  readonly renameNameRequiredError: string;
  readonly renameNameTooLongError: string;
  readonly deleteModalTitle: string;
  readonly deleteModalBody: string;
  readonly deleteConfirmLabel: string;
  readonly deleteCancelLabel: string;
}

export interface UseBrandOverviewReturn {
  readonly uiModel: BrandOverviewPageUIModel;
  readonly isRenameOpen: boolean;
  readonly isDeleteOpen: boolean;
  readonly isRenaming: boolean;
  readonly isDeleting: boolean;
  readonly initialName: string;
  readonly openRename: () => void;
  readonly closeRename: () => void;
  readonly openDelete: () => void;
  readonly closeDelete: () => void;
  readonly handleRenameSubmit: (name: string) => Promise<void>;
  readonly handleDeleteConfirm: () => Promise<void>;
}
