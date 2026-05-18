import { describe, expect, it } from 'vitest';
import { toBrandVoice, toPrismaUpsertData } from '../brand-voice.mapper';
import type { BrandVoiceRow } from '../brand-voice.mapper';

const baseRow: BrandVoiceRow = {
  brandId: 'clxbrand0001',
  tone: 'Warm and expert',
  preferredVocabulary: ['craft', 'partner'],
  restrictedVocabulary: ['cheap'],
  messagingPillars: [{ title: 'Trust', description: 'We deliver.' }] as unknown as BrandVoiceRow['messagingPillars'],
  writingStyleRules: 'Active voice.',
  audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }] as unknown as BrandVoiceRow['audienceRules'],
  approvedExamples: [{ phrase: 'Partner.' }] as unknown as BrandVoiceRow['approvedExamples'],
  rejectedExamples: [{ phrase: 'Cheap.', reason: 'Negative.' }] as unknown as BrandVoiceRow['rejectedExamples'],
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T01:00:00.000Z'),
};

describe('toBrandVoice', () => {
  it('maps a fully populated row to the domain entity', () => {
    const voice = toBrandVoice(baseRow);
    expect(voice.brandId).toBe('clxbrand0001');
    expect(voice.tone).toBe('Warm and expert');
    expect(voice.preferredVocabulary).toEqual(['craft', 'partner']);
    expect(voice.messagingPillars).toEqual([
      { title: 'Trust', description: 'We deliver.' },
    ]);
    expect(voice.audienceRules[0]?.audience).toBe('Buyers');
    expect(voice.approvedExamples[0]?.phrase).toBe('Partner.');
    expect(voice.rejectedExamples[0]?.reason).toBe('Negative.');
  });

  it('defaults list fields to empty arrays when Json columns are not arrays', () => {
    const row = {
      ...baseRow,
      messagingPillars: null as unknown as BrandVoiceRow['messagingPillars'],
      audienceRules: null as unknown as BrandVoiceRow['audienceRules'],
      approvedExamples: null as unknown as BrandVoiceRow['approvedExamples'],
      rejectedExamples: null as unknown as BrandVoiceRow['rejectedExamples'],
    };
    const voice = toBrandVoice(row);
    expect(voice.messagingPillars).toEqual([]);
    expect(voice.audienceRules).toEqual([]);
    expect(voice.approvedExamples).toEqual([]);
    expect(voice.rejectedExamples).toEqual([]);
  });

  it('rejectedExamples reason coerces non-string to null', () => {
    const row = {
      ...baseRow,
      rejectedExamples: [
        { phrase: 'Cheap', reason: null },
        { phrase: 'No', reason: undefined },
      ] as unknown as BrandVoiceRow['rejectedExamples'],
    };
    const voice = toBrandVoice(row);
    expect(voice.rejectedExamples.map((e) => e.reason)).toEqual([null, null]);
  });

  it('drops malformed Json entries silently', () => {
    const row = {
      ...baseRow,
      messagingPillars: [
        { title: 'Trust', description: 'desc' },
        { broken: true },
      ] as unknown as BrandVoiceRow['messagingPillars'],
    };
    const voice = toBrandVoice(row);
    expect(voice.messagingPillars).toHaveLength(1);
  });
});

describe('toPrismaUpsertData', () => {
  it('omits optional fields when the input does not set them', () => {
    const data = toPrismaUpsertData({ tone: 'Bold' });
    expect(data.tone).toBe('Bold');
    expect(data.preferredVocabulary).toBeUndefined();
    expect(data.messagingPillars).toBeUndefined();
  });

  it('converts every populated optional field', () => {
    const data = toPrismaUpsertData({
      tone: 'Bold',
      preferredVocabulary: ['craft'],
      restrictedVocabulary: ['cheap'],
      messagingPillars: [{ title: 'Trust', description: 'desc' }],
      writingStyleRules: 'Short.',
      audienceRules: [{ audience: 'A', rules: 'B' }],
      approvedExamples: [{ phrase: 'X' }],
      rejectedExamples: [{ phrase: 'Y', reason: null }],
    });
    expect(data.preferredVocabulary).toEqual(['craft']);
    expect(data.messagingPillars).toBeDefined();
    expect(data.writingStyleRules).toBe('Short.');
    expect(data.audienceRules).toBeDefined();
  });

  it('coerces null writingStyleRules to empty string', () => {
    const data = toPrismaUpsertData({ tone: 'Bold', writingStyleRules: null });
    expect(data.writingStyleRules).toBe('');
  });
});
