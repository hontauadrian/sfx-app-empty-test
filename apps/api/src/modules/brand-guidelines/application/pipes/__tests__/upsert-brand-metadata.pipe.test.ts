import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpsertBrandMetadataPipe } from '../upsert-brand-metadata.pipe';

describe('UpsertBrandMetadataPipe', () => {
  const pipe = new UpsertBrandMetadataPipe();

  it('accepts empty body (omitted tags)', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts empty tags array (explicit clear)', () => {
    expect(pipe.transform({ tags: [] })).toEqual({ tags: [] });
  });

  it('rejects > 64 tags', () => {
    const tags = Array.from({ length: 65 }, (_, i) => `tag-${i}`);
    expect(() => pipe.transform({ tags })).toThrow(BadRequestException);
  });

  it('rejects unknown body keys (.strict)', () => {
    expect(() => pipe.transform({ owner: 'x' })).toThrow(BadRequestException);
  });
});
