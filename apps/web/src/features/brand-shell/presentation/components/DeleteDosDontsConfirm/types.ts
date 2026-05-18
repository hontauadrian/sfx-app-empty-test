export interface DeleteDosDontsConfirmProps {
  readonly open: boolean;
  readonly ruleFragment: string;
  readonly isSubmitting: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
