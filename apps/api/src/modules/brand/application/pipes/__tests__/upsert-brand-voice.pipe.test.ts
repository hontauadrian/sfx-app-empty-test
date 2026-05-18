import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpsertBrandVoicePipe } from '../upsert-brand-voice.pipe';

describe('UpsertBrandVoicePipe', () => {
  const pipe = new UpsertBrandVoicePipe();

  it('returns the parsed value for a valid body', () => {
    const result = pipe.transform({ tone: 'Bold' });
    expect(result.tone).toBe('Bold');
  });

  it('throws BadRequestException for an empty body', () => {
    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });

  it('throws BadRequestException for unknown body keys', () => {
    expect(() => pipe.transform({ tone: 'Bold', extra: 'x' })).toThrow(BadRequestException);
  });
});
