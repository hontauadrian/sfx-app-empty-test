import { describe, expect, it } from 'vitest';
import { mapToBrandGuidelinesEmptyUIModel } from '../map-to-brand-guidelines-empty-ui-model';
import type { CommonTranslations } from '@/features/presentation/localization/types';

const labels: CommonTranslations['adminBrandGuidelines'] = {
  pageTitle: 'Brand Guidelines',
  emptyState: {
    title: 'No brand profiles yet',
    message: 'Create your first profile.',
    createCta: '+ Create',
  },
  selector: { label: '', placeholder: '', createNew: '', rename: '', delete: '' },
  createModal: {
    title: '',
    nameLabel: '',
    namePlaceholder: '',
    submitCta: '',
    submittingCta: '',
    cancelCta: '',
  },
  rename: { title: '', nameLabel: '', submitCta: '', submittingCta: '', cancelCta: '' },
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

describe('mapToBrandGuidelinesEmptyUIModel', () => {
  it('returns ready status when not loading', () => {
    const ui = mapToBrandGuidelinesEmptyUIModel({ labels, isLoading: false });
    expect(ui.status).toBe('ready');
    expect(ui.pageTitle).toBe('Brand Guidelines');
    expect(ui.emptyTitle).toBe('No brand profiles yet');
    expect(ui.emptyMessage).toBe('Create your first profile.');
    expect(ui.createCtaLabel).toBe('+ Create');
  });

  it('returns loading status when loading', () => {
    const ui = mapToBrandGuidelinesEmptyUIModel({ labels, isLoading: true });
    expect(ui.status).toBe('loading');
  });
});
