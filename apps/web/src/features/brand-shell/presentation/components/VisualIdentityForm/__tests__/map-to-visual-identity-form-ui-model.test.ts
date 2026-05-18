import { describe, expect, it } from 'vitest';
import { mapToVisualIdentityFormUIModel } from '../map-to-visual-identity-form-ui-model';
import type { AdminBrandGuidelinesVisualTranslations } from '@/features/presentation/localization/types';

const translations: AdminBrandGuidelinesVisualTranslations = {
  pageTitle: 'Visual Identity',
  sections: {
    logo: 'Logo',
    colorPalette: 'Palette',
    typography: 'Typography',
    spacing: 'Spacing',
    imageStyle: 'Image',
    iconography: 'Icons',
    restrictions: 'Restrictions',
  },
  fields: {
    logoUsage: { label: 'Logo' },
    paletteName: { label: 'Name' },
    paletteHex: { label: 'Hex' },
    paletteUsage: { label: 'Notes' },
    typographyFont: { label: 'Font' },
    typographyWeight: { label: 'Weight' },
    typographyContext: { label: 'Context' },
    spacingGuidance: { label: 'Spacing' },
    imageStyleGuidance: { label: 'Image' },
    iconographyGuidance: { label: 'Icons' },
    usageRestrictions: { label: 'Restrictions' },
  },
  cta: {
    save: 'Save',
    saving: 'Saving',
    addPaletteEntry: '+P',
    removePaletteEntry: '-P',
    addTypographyEntry: '+T',
    removeTypographyEntry: '-T',
  },
  toast: { success: 'ok', error: 'bad' },
};

describe('mapToVisualIdentityFormUIModel', () => {
  it('returns the save label when not submitting', () => {
    const ui = mapToVisualIdentityFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: false,
      submitDisabled: false,
      formError: null,
    });
    expect(ui.submitLabel).toBe('Save');
  });

  it('returns the saving label when submitting', () => {
    const ui = mapToVisualIdentityFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: true,
      submitDisabled: true,
      formError: null,
    });
    expect(ui.submitLabel).toBe('Saving');
    expect(ui.submitDisabled).toBe(true);
  });

  it('exposes formError when supplied', () => {
    const ui = mapToVisualIdentityFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: false,
      submitDisabled: false,
      formError: 'fail',
    });
    expect(ui.formError).toBe('fail');
  });

  it('reports loading status', () => {
    const ui = mapToVisualIdentityFormUIModel({
      translations,
      status: 'loading',
      isSubmitting: false,
      submitDisabled: true,
      formError: null,
    });
    expect(ui.status).toBe('loading');
  });
});
