import type { Brand } from '@sfx/domain';

export interface CreateBrandModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (brand: Brand) => void;
}

export interface CreateBrandModalUIModel {
  readonly title: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly submitLabel: string;
  readonly submitDisabled: boolean;
  readonly pending: boolean;
  readonly cancelLabel: string;
  readonly nameError: string | null;
}
