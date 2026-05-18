import { describe, expect, it } from 'vitest';
import { mapToDeleteBrandConfirmUIModel } from '../map-to-delete-brand-confirm-ui-model';
import type { CommonTranslations } from '@/features/presentation/localization/types';

const labels: CommonTranslations['adminBrandGuidelines'] = {
  pageTitle: 'Brand Guidelines',
  emptyState: { title: '', message: '', createCta: '' },
  selector: { label: '', placeholder: '', createNew: '', rename: '', delete: '' },
  createModal: {
    title: '',
    nameLabel: '',
    namePlaceholder: '',
    submitCta: '',
    submittingCta: '',
    cancelCta: '',
  },
  rename: {
    title: '',
    nameLabel: '',
    submitCta: '',
    submittingCta: '',
    cancelCta: '',
  },
  deleteConfirm: {
    title: 'Delete brand?',
    bodyTemplate: '{name} will be removed and cannot be undone.',
    confirmCta: 'Delete',
    confirmingCta: 'Deleting…',
    cancelCta: 'Cancel',
  },
  validation: { nameRequired: '', nameTooLong: '' },
  toast: {
    createSuccess: '',
    renameSuccess: '',
    deleteSuccess: '',
    unexpectedError: '',
    authError: '',
  },
  placeholderBody: { title: '', message: '' },
  notFound: { title: '', message: '', backCta: '' },
  subNav: { voice: '', visual: '', dosAndDonts: '', metadata: '', placeholderComingNextChunk: '', unsavedChangesWarning: '' },
  voice: { pageTitle: '', sections: { tone: '', preferredVocabulary: '', restrictedVocabulary: '', messagingPillars: '', writingStyle: '', audienceRules: '', approvedExamples: '', rejectedExamples: '' }, fields: { tone: { label: '' }, preferredVocabulary: { label: '' }, restrictedVocabulary: { label: '' }, messagingPillarTitle: { label: '' }, messagingPillarDescription: { label: '' }, writingStyleRules: { label: '' }, audienceRulesAudience: { label: '' }, audienceRulesRules: { label: '' }, approvedExamplePhrase: { label: '' }, rejectedExamplePhrase: { label: '' }, rejectedExampleReason: { label: '' } }, cta: { save: '', saving: '', addPreferred: '', removePreferred: '', addRestricted: '', removeRestricted: '', addPillar: '', removePillar: '', addAudienceRule: '', removeAudienceRule: '', addApprovedExample: '', removeApprovedExample: '', addRejectedExample: '', removeRejectedExample: '' }, toast: { success: '', error: '' } },
  visual: { pageTitle: '', sections: { logo: '', colorPalette: '', typography: '', spacing: '', imageStyle: '', iconography: '', restrictions: '' }, fields: { logoUsage: { label: '' }, paletteName: { label: '' }, paletteHex: { label: '' }, paletteUsage: { label: '' }, typographyFont: { label: '' }, typographyWeight: { label: '' }, typographyContext: { label: '' }, spacingGuidance: { label: '' }, imageStyleGuidance: { label: '' }, iconographyGuidance: { label: '' }, usageRestrictions: { label: '' } }, cta: { save: '', saving: '', addPaletteEntry: '', removePaletteEntry: '', addTypographyEntry: '', removeTypographyEntry: '' }, toast: { success: '', error: '' } },
};

describe('mapToDeleteBrandConfirmUIModel', () => {
  it('interpolates the brand name into bodyTemplate', () => {
    const ui = mapToDeleteBrandConfirmUIModel({ labels, brandName: 'Acme', pending: false });
    expect(ui.title).toBe('Delete brand?');
    expect(ui.bodyMessage).toBe('Acme will be removed and cannot be undone.');
    expect(ui.confirmLabel).toBe('Delete');
    expect(ui.confirmDisabled).toBe(false);
  });

  it('returns the pending confirm label when pending', () => {
    const ui = mapToDeleteBrandConfirmUIModel({ labels, brandName: 'Acme', pending: true });
    expect(ui.confirmLabel).toBe('Deleting…');
    expect(ui.confirmDisabled).toBe(true);
    expect(ui.pending).toBe(true);
  });

  it('uses an empty interpolation when brandName is empty', () => {
    const ui = mapToDeleteBrandConfirmUIModel({ labels, brandName: '', pending: false });
    expect(ui.bodyMessage).toBe(' will be removed and cannot be undone.');
  });
});
