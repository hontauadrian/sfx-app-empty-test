import { describe, expect, it } from 'vitest';
import {
  canAcceptTag,
  validateBrandMetadataTags,
  type BrandMetadataValidationMessages,
} from '../upsert-brand-metadata.resolver';

const messages: BrandMetadataValidationMessages = {
  tagTooLong: 'Tags must be 80 characters or fewer',
  tooManyTags: 'At most 64 tags',
};

describe('validateBrandMetadataTags', () => {
  it('passes empty tags', () => {
    expect(validateBrandMetadataTags([], messages)).toEqual({});
  });

  it('flags > 64 tags', () => {
    const tags = Array.from({ length: 65 }, (_, index) => `tag-${index}`);
    expect(validateBrandMetadataTags(tags, messages).tooMany).toBe(messages.tooManyTags);
  });

  it('flags tag length > 80', () => {
    expect(validateBrandMetadataTags(['x'.repeat(81)], messages).tag).toBe(messages.tagTooLong);
  });
});

describe('canAcceptTag', () => {
  it('rejects empty', () => {
    expect(canAcceptTag('   ', [], messages)).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects > 80 chars', () => {
    expect(canAcceptTag('x'.repeat(81), [], messages)).toEqual({
      ok: false,
      reason: messages.tagTooLong,
    });
  });

  it('rejects when 64 already present', () => {
    const tags = Array.from({ length: 64 }, (_, index) => `tag-${index}`);
    expect(canAcceptTag('next', tags, messages)).toEqual({
      ok: false,
      reason: messages.tooManyTags,
    });
  });

  it('rejects duplicates', () => {
    expect(canAcceptTag('en', ['en'], messages)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('accepts valid tag', () => {
    expect(canAcceptTag('en', [], messages)).toEqual({ ok: true });
  });
});
