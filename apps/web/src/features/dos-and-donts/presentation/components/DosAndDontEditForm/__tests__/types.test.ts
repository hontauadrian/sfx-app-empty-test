import { describe, expect, it } from 'vitest';
import type { DosAndDontEditFormProps } from '../types';

describe('DosAndDontEditFormProps', () => {
  it('declares the expected fields', () => {
    const value: DosAndDontEditFormProps = {
      defaultValues: {
        type: 'do',
        category: 'tone',
        title: '',
        body: '',
      },
      translations: {} as never,
      isSubmitting: false,
      serverError: null,
      submitLabel: 'Save',
      cancelLabel: 'Cancel',
      onSubmit: () => undefined,
      onCancel: () => undefined,
    };
    expect(value.submitLabel).toBe('Save');
    expect(value.defaultValues.type).toBe('do');
  });
});
