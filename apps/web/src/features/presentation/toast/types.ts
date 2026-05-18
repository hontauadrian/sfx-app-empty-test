export type ToastVariant = 'success' | 'error';

export interface Toast {
  readonly id: string;
  readonly variant: ToastVariant;
  readonly message: string;
}

export interface ToastStoreState {
  readonly toasts: ReadonlyArray<Toast>;
  readonly pushToast: (variant: ToastVariant, message: string) => string;
  readonly dismissToast: (id: string) => void;
  readonly clear: () => void;
}

export interface UseToastApi {
  readonly success: (message: string) => string;
  readonly error: (message: string) => string;
  readonly dismiss: (id: string) => void;
}
