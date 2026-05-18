import { describe, expect, it } from 'vitest';
import {
  CREATE_NEW_OPTION_VALUE,
  mapToBrandProfileSelectorUIModel,
} from '../map-to-brand-profile-selector-ui-model';
import type { Brand } from '@sfx/domain';
import type { CommonTranslations } from '@/features/presentation/localization/types';

const brand = (over: Partial<Brand>): Brand => ({
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const labels: CommonTranslations['adminBrandGuidelines'] = {
  pageTitle: 'Brand Guidelines',
  emptyState: { title: '', message: '', createCta: '' },
  selector: {
    label: 'Active brand',
    placeholder: 'Select a brand',
    createNew: '+ Create new',
    rename: 'Rename',
    delete: 'Delete',
  },
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

describe('mapToBrandProfileSelectorUIModel', () => {
  it('maps brands to options with id/name', () => {
    const ui = mapToBrandProfileSelectorUIModel({
      labels,
      brands: [brand({ id: 'a', name: 'Alpha' }), brand({ id: 'b', name: 'Beta' })],
      activeBrandId: 'a',
    });
    expect(ui.options).toEqual([
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ]);
    expect(ui.activeBrandId).toBe('a');
  });

  it('exposes the rename/delete labels and create-option value', () => {
    const ui = mapToBrandProfileSelectorUIModel({ labels, brands: [], activeBrandId: null });
    expect(ui.label).toBe('Active brand');
    expect(ui.placeholder).toBe('Select a brand');
    expect(ui.renameLabel).toBe('Rename');
    expect(ui.deleteLabel).toBe('Delete');
    expect(ui.createOptionLabel).toBe('+ Create new');
    expect(ui.createOptionValue).toBe(CREATE_NEW_OPTION_VALUE);
  });

  it('disables rename + delete when no brand is active', () => {
    const ui = mapToBrandProfileSelectorUIModel({ labels, brands: [], activeBrandId: null });
    expect(ui.renameDisabled).toBe(true);
    expect(ui.deleteDisabled).toBe(true);
  });

  it('enables rename + delete when an active brand is set', () => {
    const ui = mapToBrandProfileSelectorUIModel({
      labels,
      brands: [brand({ id: 'a' })],
      activeBrandId: 'a',
    });
    expect(ui.renameDisabled).toBe(false);
    expect(ui.deleteDisabled).toBe(false);
  });
});
