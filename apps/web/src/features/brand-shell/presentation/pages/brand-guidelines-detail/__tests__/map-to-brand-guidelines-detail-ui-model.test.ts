import { describe, expect, it } from 'vitest';
import { mapToBrandGuidelinesDetailUIModel } from '../map-to-brand-guidelines-detail-ui-model';
import type { Brand } from '@sfx/domain';
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
  placeholderBody: { title: 'Coming soon', message: 'Soon.' },
  notFound: { title: 'Brand not found', message: 'Gone.', backCta: 'Back' },
  subNav: {
    voice: 'Voice',
    visual: 'Visual',
    dosAndDonts: 'Dos',
    metadata: 'Meta',
    placeholderComingNextChunk: 'Soon',
    unsavedChangesWarning: 'Discard?',
  },
  voice: {
    pageTitle: 'Brand Voice',
    sections: {
      tone: '',
      preferredVocabulary: '',
      restrictedVocabulary: '',
      messagingPillars: '',
      writingStyle: '',
      audienceRules: '',
      approvedExamples: '',
      rejectedExamples: '',
    },
    fields: {
      tone: { label: '' },
      preferredVocabulary: { label: '' },
      restrictedVocabulary: { label: '' },
      messagingPillarTitle: { label: '' },
      messagingPillarDescription: { label: '' },
      writingStyleRules: { label: '' },
      audienceRulesAudience: { label: '' },
      audienceRulesRules: { label: '' },
      approvedExamplePhrase: { label: '' },
      rejectedExamplePhrase: { label: '' },
      rejectedExampleReason: { label: '' },
    },
    cta: {
      save: '',
      saving: '',
      addPreferred: '',
      removePreferred: '',
      addRestricted: '',
      removeRestricted: '',
      addPillar: '',
      removePillar: '',
      addAudienceRule: '',
      removeAudienceRule: '',
      addApprovedExample: '',
      removeApprovedExample: '',
      addRejectedExample: '',
      removeRejectedExample: '',
    },
    toast: { success: '', error: '' },
  },
  visual: {
    pageTitle: 'Visual Identity',
    sections: {
      logo: '',
      colorPalette: '',
      typography: '',
      spacing: '',
      imageStyle: '',
      iconography: '',
      restrictions: '',
    },
    fields: {
      logoUsage: { label: '' },
      paletteName: { label: '' },
      paletteHex: { label: '' },
      paletteUsage: { label: '' },
      typographyFont: { label: '' },
      typographyWeight: { label: '' },
      typographyContext: { label: '' },
      spacingGuidance: { label: '' },
      imageStyleGuidance: { label: '' },
      iconographyGuidance: { label: '' },
      usageRestrictions: { label: '' },
    },
    cta: {
      save: '',
      saving: '',
      addPaletteEntry: '',
      removePaletteEntry: '',
      addTypographyEntry: '',
      removeTypographyEntry: '',
    },
    toast: { success: '', error: '' },
  },
};

const brand: Brand = {
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('mapToBrandGuidelinesDetailUIModel', () => {
  it('builds the ready uiModel with the active brand name', () => {
    const ui = mapToBrandGuidelinesDetailUIModel({
      labels,
      status: 'ready',
      activeBrand: brand,
    });
    expect(ui.status).toBe('ready');
    expect(ui.pageTitle).toBe('Brand Guidelines');
    expect(ui.activeBrandName).toBe('Acme');
    expect(ui.placeholder.title).toBe('Coming soon');
  });

  it('builds the not-found uiModel with the back link to the list', () => {
    const ui = mapToBrandGuidelinesDetailUIModel({
      labels,
      status: 'not-found',
      activeBrand: null,
    });
    expect(ui.status).toBe('not-found');
    expect(ui.notFound.backHref).toBe('/admin/brand-guidelines');
    expect(ui.notFound.title).toBe('Brand not found');
    expect(ui.activeBrandName).toBe('');
  });

  it('builds the loading uiModel', () => {
    const ui = mapToBrandGuidelinesDetailUIModel({
      labels,
      status: 'loading',
      activeBrand: null,
    });
    expect(ui.status).toBe('loading');
  });
});
