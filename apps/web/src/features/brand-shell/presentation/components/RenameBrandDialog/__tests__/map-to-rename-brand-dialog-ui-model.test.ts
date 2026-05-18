import { describe, expect, it } from 'vitest';
import { mapToRenameBrandDialogUIModel } from '../map-to-rename-brand-dialog-ui-model';
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
    title: 'Rename brand',
    nameLabel: 'Brand name',
    submitCta: 'Save',
    submittingCta: 'Saving…',
    cancelCta: 'Cancel',
  },
  deleteConfirm: {
    title: '',
    bodyTemplate: '',
    confirmCta: '',
    confirmingCta: '',
    cancelCta: '',
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

describe('mapToRenameBrandDialogUIModel', () => {
  it('returns idle labels when not pending', () => {
    const ui = mapToRenameBrandDialogUIModel({ labels, nameError: null, pending: false });
    expect(ui.title).toBe('Rename brand');
    expect(ui.submitLabel).toBe('Save');
    expect(ui.submitDisabled).toBe(false);
    expect(ui.nameError).toBeNull();
  });

  it('returns pending labels when pending', () => {
    const ui = mapToRenameBrandDialogUIModel({ labels, nameError: null, pending: true });
    expect(ui.submitLabel).toBe('Saving…');
    expect(ui.submitDisabled).toBe(true);
    expect(ui.pending).toBe(true);
  });

  it('passes through the name error', () => {
    const ui = mapToRenameBrandDialogUIModel({
      labels,
      nameError: 'Name is required',
      pending: false,
    });
    expect(ui.nameError).toBe('Name is required');
  });
});
