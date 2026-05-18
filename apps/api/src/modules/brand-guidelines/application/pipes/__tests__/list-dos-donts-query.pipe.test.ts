import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListDosDontsQueryPipe } from '../list-dos-donts-query.pipe';

describe('ListDosDontsQueryPipe', () => {
  const pipe = new ListDosDontsQueryPipe();

  it('accepts empty', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('accepts both filters', () => {
    expect(pipe.transform({ type: 'dont', category: 'legal' })).toEqual({
      type: 'dont',
      category: 'legal',
    });
  });

  it('rejects unknown filter values', () => {
    expect(() => pipe.transform({ type: 'maybe' })).toThrow(BadRequestException);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(() => pipe.transform({ limit: 10 })).toThrow(BadRequestException);
  });
});
