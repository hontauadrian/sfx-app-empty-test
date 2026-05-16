import { describe, expect, it } from 'vitest';
import { visualIdentityFormSchema } from '../visual-identity-form';

describe('visualIdentityFormSchema', () => {
  it('re-exports the @sfx/validation visualIdentityWriteSchema and accepts empty input', () => {
    const result = visualIdentityFormSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects a colourPalette entry with an invalid hex value', () => {
    const result = visualIdentityFormSchema.safeParse({
      colourPalette: [{ name: 'Bad', hex: 'blue' }],
    });
    expect(result.success).toBe(false);
  });
});
