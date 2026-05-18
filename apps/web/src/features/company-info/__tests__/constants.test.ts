import { describe, expect, it } from 'vitest';
import {
  COMPANY_INFO_ENDPOINT,
  COMPANY_INFO_QUERY_KEY,
  COMPANY_INFO_VERSIONS_QUERY_KEY,
  COMPANY_INFO_VERSION_QUERY_KEY,
} from '../constants';

describe('company-info constants', () => {
  it('declares the endpoint root path', () => {
    expect(COMPANY_INFO_ENDPOINT).toBe('api/v1/company-info');
  });

  it('declares COMPANY_INFO_QUERY_KEY as a single-element tuple sharing the company-info prefix', () => {
    expect(Array.from(COMPANY_INFO_QUERY_KEY)).toEqual(['company-info']);
  });

  it('declares COMPANY_INFO_VERSIONS_QUERY_KEY as a 2-tuple under the company-info prefix', () => {
    expect(Array.from(COMPANY_INFO_VERSIONS_QUERY_KEY)).toEqual(['company-info', 'versions']);
  });

  it('builds COMPANY_INFO_VERSION_QUERY_KEY(id) as a 3-tuple under the versions prefix', () => {
    expect(Array.from(COMPANY_INFO_VERSION_QUERY_KEY('v-1'))).toEqual([
      'company-info',
      'versions',
      'v-1',
    ]);
  });

  it('returns distinct cache keys for distinct ids', () => {
    expect(COMPANY_INFO_VERSION_QUERY_KEY('a')).not.toEqual(COMPANY_INFO_VERSION_QUERY_KEY('b'));
  });
});
