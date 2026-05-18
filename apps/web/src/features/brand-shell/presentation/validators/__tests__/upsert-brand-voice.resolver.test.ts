import { describe, expect, it } from 'vitest';
import { upsertBrandVoiceResolver } from '../upsert-brand-voice.resolver';

describe('upsertBrandVoiceResolver', () => {
  it('accepts a minimal valid payload', async () => {
    const result = await upsertBrandVoiceResolver({ tone: 'Bold' }, undefined, {
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect(result.errors).toEqual({});
    expect((result.values as { tone: string }).tone).toBe('Bold');
  });

  it('emits a field error for empty tone', async () => {
    const result = await upsertBrandVoiceResolver({ tone: '' }, undefined, {
      shouldUseNativeValidation: false,
      fields: {},
    });
    expect((result.errors as { tone?: { message: string } }).tone?.message).toBe(
      'Tone of voice is required',
    );
  });

  it('emits a field error for an oversize tone', async () => {
    const result = await upsertBrandVoiceResolver(
      { tone: 'x'.repeat(4001) },
      undefined,
      { shouldUseNativeValidation: false, fields: {} },
    );
    expect((result.errors as { tone?: { message: string } }).tone?.message).toBe(
      'Tone must be 4000 characters or fewer',
    );
  });
});
