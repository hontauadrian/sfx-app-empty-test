import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateDosDontsEntryPipe } from '../create-dos-donts-entry.pipe';

describe('CreateDosDontsEntryPipe', () => {
  const pipe = new CreateDosDontsEntryPipe();

  it('passes a valid body unchanged (with trim)', () => {
    expect(
      pipe.transform({
        type: 'do',
        category: 'tone',
        ruleText: '  rule  ',
      }),
    ).toEqual({ type: 'do', category: 'tone', ruleText: 'rule' });
  });

  it('throws BadRequestException with per-field errors on invalid body', () => {
    try {
      pipe.transform({ type: 'maybe', category: 'tone', ruleText: '' });
      throw new Error('should not reach');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as { errors: { field: string }[] };
      expect(response.errors.length).toBeGreaterThan(0);
      expect(response.errors.map((e) => e.field)).toContain('type');
    }
  });

  it('rejects unknown body keys (.strict)', () => {
    expect(() =>
      pipe.transform({
        type: 'do',
        category: 'tone',
        ruleText: 'rule',
        brandId: 'leak',
      }),
    ).toThrow(BadRequestException);
  });
});
