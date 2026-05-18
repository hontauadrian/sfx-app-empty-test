import { describe, expect, it } from 'vitest';
import { mapToBrandVoiceFormUIModel } from '../map-to-brand-voice-form-ui-model';
import type { AdminBrandGuidelinesVoiceTranslations } from '@/features/presentation/localization/types';

const translations: AdminBrandGuidelinesVoiceTranslations = {
  pageTitle: 'Brand Voice',
  sections: {
    tone: 'Tone',
    preferredVocabulary: 'Preferred',
    restrictedVocabulary: 'Restricted',
    messagingPillars: 'Pillars',
    writingStyle: 'Style',
    audienceRules: 'Audience',
    approvedExamples: 'Approved',
    rejectedExamples: 'Rejected',
  },
  fields: {
    tone: { label: 'Tone' },
    preferredVocabulary: { label: 'Pref' },
    restrictedVocabulary: { label: 'Rest' },
    messagingPillarTitle: { label: 'Title' },
    messagingPillarDescription: { label: 'Description' },
    writingStyleRules: { label: 'Rules' },
    audienceRulesAudience: { label: 'Audience' },
    audienceRulesRules: { label: 'Rules' },
    approvedExamplePhrase: { label: 'Phrase' },
    rejectedExamplePhrase: { label: 'Phrase' },
    rejectedExampleReason: { label: 'Reason' },
  },
  cta: {
    save: 'Save',
    saving: 'Saving',
    addPreferred: '+Pref',
    removePreferred: '-Pref',
    addRestricted: '+Rest',
    removeRestricted: '-Rest',
    addPillar: '+Pillar',
    removePillar: '-Pillar',
    addAudienceRule: '+Aud',
    removeAudienceRule: '-Aud',
    addApprovedExample: '+Appr',
    removeApprovedExample: '-Appr',
    addRejectedExample: '+Rej',
    removeRejectedExample: '-Rej',
  },
  toast: { success: 'ok', error: 'bad' },
};

describe('mapToBrandVoiceFormUIModel', () => {
  it('returns the idle submit label when not submitting', () => {
    const ui = mapToBrandVoiceFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: false,
      submitDisabled: false,
      formError: null,
    });
    expect(ui.submitLabel).toBe('Save');
    expect(ui.submitDisabled).toBe(false);
    expect(ui.isSubmitting).toBe(false);
  });

  it('returns the saving label and disables submit when submitting', () => {
    const ui = mapToBrandVoiceFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: true,
      submitDisabled: true,
      formError: null,
    });
    expect(ui.submitLabel).toBe('Saving');
    expect(ui.submitDisabled).toBe(true);
  });

  it('passes through the page title and form error', () => {
    const ui = mapToBrandVoiceFormUIModel({
      translations,
      status: 'ready',
      isSubmitting: false,
      submitDisabled: false,
      formError: 'oops',
    });
    expect(ui.pageTitle).toBe('Brand Voice');
    expect(ui.formError).toBe('oops');
  });

  it('reports loading status while data is in flight', () => {
    const ui = mapToBrandVoiceFormUIModel({
      translations,
      status: 'loading',
      isSubmitting: false,
      submitDisabled: true,
      formError: null,
    });
    expect(ui.status).toBe('loading');
    expect(ui.submitDisabled).toBe(true);
  });
});
