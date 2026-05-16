import { describe, expect, it } from 'vitest';
import { contentCheckFormResolverSchema } from '../content-check-form';

describe('contentCheckFormResolverSchema', () => {
  it('re-exports the @sfx/validation contentCheckFormSchema', () => {
    const ok = contentCheckFormResolverSchema.safeParse({
      pastedText: 'hello',
      category: 'tone',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects an unknown category', () => {
    const fail = contentCheckFormResolverSchema.safeParse({
      pastedText: '',
      category: 'not-a-real-category',
    });
    expect(fail.success).toBe(false);
  });
});
