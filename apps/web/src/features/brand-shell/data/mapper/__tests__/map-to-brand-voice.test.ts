import { describe, expect, it } from 'vitest';
import { mapToBrandVoice, mapToBrandVoiceOrNull } from '../map-to-brand-voice';
import type { BrandVoiceDataModel } from '../../model/brand-voice-data-model';

const sample: BrandVoiceDataModel = {
  brandId: 'clxbrand0001',
  tone: 'Bold',
  preferredVocabulary: ['craft'],
  restrictedVocabulary: [],
  messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
  writingStyleRules: 'Short.',
  audienceRules: [],
  approvedExamples: [],
  rejectedExamples: [{ phrase: 'No.', reason: null }],
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T01:00:00.000Z',
};

describe('mapToBrandVoice', () => {
  it('converts ISO strings to Date instances', () => {
    const value = mapToBrandVoice(sample);
    expect(value.createdAt).toBeInstanceOf(Date);
    expect(value.createdAt.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  it('passes through every list and scalar field', () => {
    const value = mapToBrandVoice(sample);
    expect(value.tone).toBe('Bold');
    expect(value.preferredVocabulary).toEqual(['craft']);
    expect(value.messagingPillars).toEqual([{ title: 'Trust', description: 'We deliver.' }]);
    expect(value.rejectedExamples[0]?.reason).toBeNull();
  });

  it('does NOT swallow invalid timestamps — propagates Invalid Date', () => {
    const value = mapToBrandVoice({ ...sample, createdAt: 'broken' });
    expect(Number.isNaN(value.createdAt.getTime())).toBe(true);
  });
});

describe('mapToBrandVoiceOrNull', () => {
  it('returns null for null input', () => {
    expect(mapToBrandVoiceOrNull(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(mapToBrandVoiceOrNull(undefined)).toBeNull();
  });

  it('maps a populated input', () => {
    const value = mapToBrandVoiceOrNull(sample);
    expect(value?.brandId).toBe('clxbrand0001');
  });
});
