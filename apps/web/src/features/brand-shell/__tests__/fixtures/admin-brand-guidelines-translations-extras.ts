// Shared test-fixture snippet — the `subNav`, `voice`, `visual` sub-trees
// that every existing AdminBrandGuidelinesTranslations literal must include
// since Chunk B extended the contract.
import type {
  AdminBrandGuidelinesSubNavTranslations,
  AdminBrandGuidelinesVisualTranslations,
  AdminBrandGuidelinesVoiceTranslations,
} from '@/features/presentation/localization/types';

export const adminBrandGuidelinesSubNavFixture: AdminBrandGuidelinesSubNavTranslations = {
  voice: 'Voice',
  visual: 'Visual',
  dosAndDonts: 'Dos',
  metadata: 'Meta',
  placeholderComingNextChunk: 'Soon',
  unsavedChangesWarning: 'Discard?',
};

export const adminBrandGuidelinesVoiceFixture: AdminBrandGuidelinesVoiceTranslations = {
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
};

export const adminBrandGuidelinesVisualFixture: AdminBrandGuidelinesVisualTranslations = {
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
};
