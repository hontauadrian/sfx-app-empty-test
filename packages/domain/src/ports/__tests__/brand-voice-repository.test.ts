import { describe, expect, it } from 'vitest';
import type { BrandVoice, UpsertBrandVoiceInput } from '../../entities/brand-voice';
import type {
  BrandGuidelineEditor,
  BrandVoiceRepository,
} from '../brand-voice-repository';

describe('BrandVoiceRepository port', () => {
  const editor: BrandGuidelineEditor = {
    editorUserId: 'subject-admin',
    editorDisplayName: 'admin@example.test',
  };

  const sample: BrandVoice = {
    brandId: 'clxbrand0001',
    tone: 'Friendly',
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: '',
    audienceRules: [],
    approvedExamples: [],
    rejectedExamples: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const repo: BrandVoiceRepository = {
    async findByBrandId(brandId) {
      return brandId === sample.brandId ? sample : null;
    },
    async upsertForBrand(brandId, input, ed) {
      expect(ed.editorUserId).toBe(editor.editorUserId);
      return { ...sample, brandId, tone: input.tone };
    },
  };

  it('findByBrandId returns the row when present', async () => {
    const row = await repo.findByBrandId('clxbrand0001');
    expect(row?.tone).toBe('Friendly');
  });

  it('findByBrandId returns null when missing', async () => {
    expect(await repo.findByBrandId('unknown')).toBeNull();
  });

  it('upsertForBrand returns the persisted entity', async () => {
    const input: UpsertBrandVoiceInput = { tone: 'Bold' };
    const row = await repo.upsertForBrand('clxbrand0001', input, editor);
    expect(row.tone).toBe('Bold');
    expect(row.brandId).toBe('clxbrand0001');
  });
});
