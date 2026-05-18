import type { Brand } from '@sfx/domain';

export interface RenameBrandDialogProps {
  readonly open: boolean;
  readonly brand: Brand | null;
  readonly onClose: () => void;
  readonly onRenamed: (brand: Brand) => void;
}

export interface RenameBrandDialogUIModel {
  readonly title: string;
  readonly nameLabel: string;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
  readonly pending: boolean;
  readonly cancelLabel: string;
  readonly nameError: string | null;
}
