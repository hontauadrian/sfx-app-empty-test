import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GuidelineSearchQueryPipe } from '../guideline-search-query.pipe';

describe('GuidelineSearchQueryPipe', () => {
  const pipe = new GuidelineSearchQueryPipe();

  it('accepts empty', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts a q value', () => {
    expect(pipe.transform({ q: 'wordmark' })).toEqual({ q: 'wordmark' });
  });

  it('rejects q longer than 200 chars', () => {
    expect(() => pipe.transform({ q: 'x'.repeat(201) })).toThrow(BadRequestException);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(() => pipe.transform({ q: 'x', limit: 5 })).toThrow(BadRequestException);
  });
});
