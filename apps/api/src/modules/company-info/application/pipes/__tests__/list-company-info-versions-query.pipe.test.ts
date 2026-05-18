import { BadRequestException } from '@nestjs/common';
import { ListCompanyInfoVersionsQueryPipe } from '../list-company-info-versions-query.pipe';

describe('ListCompanyInfoVersionsQueryPipe', () => {
  const pipe = new ListCompanyInfoVersionsQueryPipe();

  it('accepts an empty object', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it("coerces { take: '25' } → { take: 25 }", () => {
    expect(pipe.transform({ take: '25' })).toEqual({ take: 25 });
  });

  it("rejects { take: '0' } (below min)", () => {
    expect(() => pipe.transform({ take: '0' })).toThrow(BadRequestException);
  });

  it("rejects { take: '101' } (above max)", () => {
    expect(() => pipe.transform({ take: '101' })).toThrow(BadRequestException);
  });

  it("rejects { take: 'fifty' } (non-numeric)", () => {
    expect(() => pipe.transform({ take: 'fifty' })).toThrow(BadRequestException);
  });

  it('accepts { cursor: "abc" }', () => {
    expect(pipe.transform({ cursor: 'abc' })).toEqual({ cursor: 'abc' });
  });

  it('rejects { cursor: "" }', () => {
    expect(() => pipe.transform({ cursor: '' })).toThrow(BadRequestException);
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => pipe.transform({ foo: 'bar' })).toThrow(BadRequestException);
  });
});
