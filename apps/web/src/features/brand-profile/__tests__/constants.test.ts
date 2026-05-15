import { describe, expect, it } from 'vitest';
import {
  BRAND_DESCRIPTION_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  BRANDS_ENDPOINT,
  BRANDS_QUERY_KEY,
  DASHBOARD_ROUTE,
  NEW_BRAND_ROUTE,
  brandQueryKey,
  brandRoute,
} from '../constants';

describe('brand-profile constants', () => {
  it('exposes the brand-profile API endpoint', () => {
    expect(BRANDS_ENDPOINT).toBe('api/v1/brands');
  });

  it('exposes a stable list query key', () => {
    expect(BRANDS_QUERY_KEY).toEqual(['brands']);
  });

  it('builds nested per-brand query keys (array-prefix matching)', () => {
    expect(brandQueryKey('abc')).toEqual(['brands', 'abc']);
  });

  it('builds the per-brand route', () => {
    expect(brandRoute('abc')).toBe('/brands/abc');
  });

  it('exposes the dashboard and new-brand routes', () => {
    expect(DASHBOARD_ROUTE).toBe('/');
    expect(NEW_BRAND_ROUTE).toBe('/brands/new');
  });

  it('mirrors the validation max-length constants', () => {
    expect(BRAND_NAME_MAX_LENGTH).toBe(120);
    expect(BRAND_DESCRIPTION_MAX_LENGTH).toBe(2000);
  });
});
