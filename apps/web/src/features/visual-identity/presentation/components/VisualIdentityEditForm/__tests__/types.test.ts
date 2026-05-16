import { describe, expect, it } from 'vitest';
import type { VisualIdentityEditFormProps } from '../types';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';

describe('VisualIdentityEditFormProps', () => {
  it('accepts a fully-populated props bag', () => {
    const props: VisualIdentityEditFormProps = {
      defaultValues: {
        logoUsageRules: null,
        colourPalette: [],
        typographyRules: [],
        spacingLayoutGuidance: null,
        imageStyleGuidance: null,
        iconographyGuidance: null,
        usageRestrictions: null,
      } as never,
      translations: enCommon,
      isSubmitting: false,
      serverError: null,
      saveLabel: 'Save',
      cancelLabel: 'Cancel',
      onSubmit: () => undefined,
      onCancel: () => undefined,
    };
    expect(props.saveLabel).toBe('Save');
  });
});
