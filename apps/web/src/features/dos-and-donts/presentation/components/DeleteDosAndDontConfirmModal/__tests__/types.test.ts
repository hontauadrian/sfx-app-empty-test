import { describe, expect, it } from 'vitest';
import type { DeleteDosAndDontConfirmModalProps } from '../types';

describe('DeleteDosAndDontConfirmModalProps', () => {
  it('declares the required prop shape', () => {
    const props: DeleteDosAndDontConfirmModalProps = {
      title: 't',
      body: 'b',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      isSubmitting: false,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    };
    expect(typeof props.onConfirm).toBe('function');
  });
});
