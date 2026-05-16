import { describe, expect, it } from 'vitest';
import type { CommonTranslations } from '@/features/presentation/localization';
import { common } from '@/features/presentation/localization/languages/en/common';
import {
  buildDefaultValues,
  mapToVoiceEditPageUIModel,
} from '../map-to-voice-edit-page-ui-model';
import type { BrandVoice } from '../../../../data/mapper/map-to-brand-voice';

const translations: CommonTranslations = common;

describe('buildDefaultValues', () => {
  it('returns empty defaults when voice is undefined', () => {
    const values = buildDefaultValues(undefined);
    expect(values.toneOfVoice).toBeNull();
    expect(values.preferredVocabulary).toEqual([]);
    expect(values.audienceRules).toEqual([]);
  });

  it('clones populated voice into form values', () => {
    const voice: BrandVoice = {
      brandProfileId: 'b-1',
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer.' }],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    };
    const values = buildDefaultValues(voice);
    expect(values.toneOfVoice).toBe('Warm.');
    expect(values.preferredVocabulary).toEqual(['craft']);
    expect(values.audienceRules).toEqual([{ audience: 'Gen Z', rule: 'Peer.' }]);
  });
});

describe('mapToVoiceEditPageUIModel', () => {
  it('returns the loading-state UI model', () => {
    const ui = mapToVoiceEditPageUIModel({
      translations,
      voice: undefined,
      isLoading: true,
      notFound: false,
      hasError: false,
      serverError: null,
    });
    expect(ui.isLoading).toBe(true);
    expect(ui.title).toBe(translations.brandVoiceEditPageTitle);
    expect(ui.saveLabel).toBe(translations.save);
    expect(ui.serverErrorLabel).toBeNull();
  });

  it('surfaces the server error message', () => {
    const ui = mapToVoiceEditPageUIModel({
      translations,
      voice: undefined,
      isLoading: false,
      notFound: false,
      hasError: false,
      serverError: 'boom',
    });
    expect(ui.serverErrorLabel).toBe('boom');
  });

  it('flags notFound and hasError', () => {
    const ui = mapToVoiceEditPageUIModel({
      translations,
      voice: undefined,
      isLoading: false,
      notFound: true,
      hasError: false,
      serverError: null,
    });
    expect(ui.notFound).toBe(true);
    expect(ui.hasError).toBe(false);
  });
});
