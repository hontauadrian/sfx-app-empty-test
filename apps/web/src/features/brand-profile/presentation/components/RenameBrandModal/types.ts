export interface RenameBrandModalProps {
  readonly title: string;
  readonly nameLabel: string;
  readonly initialName: string;
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly nameRequiredError: string;
  readonly nameTooLongError: string;
  readonly isSubmitting: boolean;
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
}
