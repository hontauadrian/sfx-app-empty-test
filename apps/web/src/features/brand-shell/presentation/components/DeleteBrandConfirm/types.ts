import type { Brand } from '@sfx/domain';

export interface DeleteBrandConfirmProps {
  readonly open: boolean;
  readonly brand: Brand | null;
  readonly onClose: () => void;
  readonly onDeleted: (deletedId: string) => void;
}

export interface DeleteBrandConfirmUIModel {
  readonly title: string;
  readonly bodyMessage: string;
  readonly confirmLabel: string;
  readonly confirmDisabled: boolean;
  readonly pending: boolean;
  readonly cancelLabel: string;
}
