import { describe, expect, it } from 'vitest';
import { dosAndDontFormSchema } from '../dos-and-dont-form';

describe('dosAndDontFormSchema', () => {
  it('accepts a populated payload', () => {
    expect(
      dosAndDontFormSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
      }).success,
    ).toBe(true);
  });

  it('rejects whitespace title', () => {
    expect(
      dosAndDontFormSchema.safeParse({
        type: 'do',
        category: 'tone',
        title: '   ',
        body: 'b',
      }).success,
    ).toBe(false);
  });
});
