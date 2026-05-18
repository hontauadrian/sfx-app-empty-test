import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpsertVisualIdentityPipe } from '../upsert-visual-identity.pipe';

describe('UpsertVisualIdentityPipe', () => {
  const pipe = new UpsertVisualIdentityPipe();

  it('returns the parsed value for a valid body', () => {
    const result = pipe.transform({ logoUsage: 'Default' });
    expect(result.logoUsage).toBe('Default');
  });

  it('throws BadRequestException for an empty body', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('throws BadRequestException for an invalid hex value', () => {
    expect(() =>
      pipe.transform({
        logoUsage: 'Default',
        colorPalette: [{ name: 'P', hex: 'red', usageNotes: null }],
      }),
    ).toThrow(BadRequestException);
  });
});
