import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ListBrandGuidelinesVersionsQueryPipe } from '../list-brand-guidelines-versions-query.pipe';

describe('ListBrandGuidelinesVersionsQueryPipe', () => {
  const pipe = new ListBrandGuidelinesVersionsQueryPipe();

  it('accepts an empty query', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it('coerces numeric take from string', () => {
    expect(pipe.transform({ take: '10' })).toEqual({ take: 10 });
  });

  it('accepts a non-empty cursor', () => {
    expect(pipe.transform({ take: '5', cursor: 'v-1' })).toEqual({ take: 5, cursor: 'v-1' });
  });

  it('rejects take = 0', () => {
    expect(() => pipe.transform({ take: '0' })).toThrow(BadRequestException);
  });

  it('rejects take = 101', () => {
    expect(() => pipe.transform({ take: '101' })).toThrow(BadRequestException);
  });

  it('rejects empty cursor', () => {
    expect(() => pipe.transform({ cursor: '' })).toThrow(BadRequestException);
  });

  it('rejects unknown query key under .strict()', () => {
    expect(() => pipe.transform({ extra: 'x' })).toThrow(BadRequestException);
  });
});
