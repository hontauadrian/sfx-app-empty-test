import { describe, expect, it } from 'vitest';
import { brandVoiceFormSchema } from '../brand-voice-form';

describe('brandVoiceFormSchema', () => {
  it('re-exports the @sfx/validation brandVoiceWriteSchema', () => {
    const result = brandVoiceFormSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects a duplicate vocabulary entry', () => {
    const result = brandVoiceFormSchema.safeParse({
      preferredVocabulary: ['foo', 'FOO'],
    });
    expect(result.success).toBe(false);
  });
});
