import { describe, expect, it } from 'vitest';
import { mapToCreateBrandModalUIModel } from '../map-to-create-brand-modal-ui-model';
import type { CommonTranslations } from '@/features/presentation/localization/types';

const labels: CommonTranslations['adminBrandGuidelines'] = {
  pageTitle: 'Brand Guidelines',
  emptyState: {
    title: 'No brand profiles yet',
    message: 'Create your first brand profile to start defining its guidelines.',
    createCta: '+ Create brand profile',
  },
  selector: {
    label: 'Active brand',
    placeholder: 'Select a brand',
    createNew: '+ Create new',
    rename: 'Rename',
    delete: 'Delete',
  },
  createModal: {
    title: 'Create brand profile',
    nameLabel: 'Brand name',
    namePlaceholder: 'Acme Holdings',
    submitCta: 'Create',
    submittingCta: 'Creating…',
    cancelCta: 'Cancel',
  },
  rename: {
    title: 'Rename brand',
    nameLabel: 'Brand name',
    submitCta: 'Save',
    submittingCta: 'Saving…',
    cancelCta: 'Cancel',
  },
  deleteConfirm: {
    title: 'Delete brand?',
    bodyTemplate: '{name} will be removed and cannot be undone.',
    confirmCta: 'Delete',
    confirmingCta: 'Deleting…',
    cancelCta: 'Cancel',
  },
  validation: {
    nameRequired: 'Name is required',
    nameTooLong: 'Name must be 200 characters or fewer',
  },
  toast: {
    createSuccess: 'Brand created',
    renameSuccess: 'Brand renamed',
    deleteSuccess: 'Brand deleted',
    unexpectedError: 'We could not complete that. Try again.',
    authError: 'Your session expired. Sign in again.',
  },
  placeholderBody: { title: 'Guidelines coming soon', message: 'Soon.' },
  notFound: { title: 'Brand not found', message: 'Gone.', backCta: 'Back' },
  subNav: { voice: '', visual: '', dosAndDonts: '', metadata: '', placeholderComingNextChunk: '', unsavedChangesWarning: '' },
  voice: { pageTitle: '', sections: { tone: '', preferredVocabulary: '', restrictedVocabulary: '', messagingPillars: '', writingStyle: '', audienceRules: '', approvedExamples: '', rejectedExamples: '' }, fields: { tone: { label: '' }, preferredVocabulary: { label: '' }, restrictedVocabulary: { label: '' }, messagingPillarTitle: { label: '' }, messagingPillarDescription: { label: '' }, writingStyleRules: { label: '' }, audienceRulesAudience: { label: '' }, audienceRulesRules: { label: '' }, approvedExamplePhrase: { label: '' }, rejectedExamplePhrase: { label: '' }, rejectedExampleReason: { label: '' } }, cta: { save: '', saving: '', addPreferred: '', removePreferred: '', addRestricted: '', removeRestricted: '', addPillar: '', removePillar: '', addAudienceRule: '', removeAudienceRule: '', addApprovedExample: '', removeApprovedExample: '', addRejectedExample: '', removeRejectedExample: '' }, toast: { success: '', error: '' } },
  visual: { pageTitle: '', sections: { logo: '', colorPalette: '', typography: '', spacing: '', imageStyle: '', iconography: '', restrictions: '' }, fields: { logoUsage: { label: '' }, paletteName: { label: '' }, paletteHex: { label: '' }, paletteUsage: { label: '' }, typographyFont: { label: '' }, typographyWeight: { label: '' }, typographyContext: { label: '' }, spacingGuidance: { label: '' }, imageStyleGuidance: { label: '' }, iconographyGuidance: { label: '' }, usageRestrictions: { label: '' } }, cta: { save: '', saving: '', addPaletteEntry: '', removePaletteEntry: '', addTypographyEntry: '', removeTypographyEntry: '' }, toast: { success: '', error: '' } },
};

describe('mapToCreateBrandModalUIModel', () => {
  it('returns idle labels and error pass-through when not pending', () => {
    const ui = mapToCreateBrandModalUIModel({ labels, nameError: null, pending: false });
    expect(ui.title).toBe('Create brand profile');
    expect(ui.submitLabel).toBe('Create');
    expect(ui.submitDisabled).toBe(false);
    expect(ui.pending).toBe(false);
    expect(ui.nameError).toBeNull();
  });

  it('switches to the submitting label and disables submit while pending', () => {
    const ui = mapToCreateBrandModalUIModel({ labels, nameError: null, pending: true });
    expect(ui.submitLabel).toBe('Creating…');
    expect(ui.submitDisabled).toBe(true);
    expect(ui.pending).toBe(true);
  });

  it('passes through a name error when present', () => {
    const ui = mapToCreateBrandModalUIModel({
      labels,
      nameError: 'Name is required',
      pending: false,
    });
    expect(ui.nameError).toBe('Name is required');
  });
});
