import { describe, expect, it } from 'vitest';
import {
  ADMIN_BRAND_GUIDELINES_ROUTE,
  ADMIN_COMPANY_INFO_ROUTE,
  ADMIN_ROUTE,
  ADMIN_TAB_REGISTRY,
  HOME_ROUTE,
} from '../constants';

describe('admin-shell constants', () => {
  it('exposes HOME_ROUTE as /', () => {
    expect(HOME_ROUTE).toBe('/');
  });

  it('exposes ADMIN_ROUTE as /admin', () => {
    expect(ADMIN_ROUTE).toBe('/admin');
  });

  it('exposes ADMIN_COMPANY_INFO_ROUTE as /admin/company-info', () => {
    expect(ADMIN_COMPANY_INFO_ROUTE).toBe('/admin/company-info');
  });

  it('exposes ADMIN_BRAND_GUIDELINES_ROUTE as /admin/brand-guidelines', () => {
    expect(ADMIN_BRAND_GUIDELINES_ROUTE).toBe('/admin/brand-guidelines');
  });
});

describe('ADMIN_TAB_REGISTRY', () => {
  it('is a non-empty readonly array', () => {
    expect(Array.isArray(ADMIN_TAB_REGISTRY)).toBe(true);
    expect(ADMIN_TAB_REGISTRY.length).toBeGreaterThan(0);
  });

  it('first entry is companyInfo pointing at ADMIN_COMPANY_INFO_ROUTE', () => {
    const first = ADMIN_TAB_REGISTRY[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('expected first tab');
    expect(first.id).toBe('companyInfo');
    expect(first.labelKey).toBe('companyInfo');
    expect(first.href).toBe(ADMIN_COMPANY_INFO_ROUTE);
    expect(typeof first.isActive).toBe('function');
  });

  describe('companyInfo isActive', () => {
    const tab = ADMIN_TAB_REGISTRY.find((entry) => entry.id === 'companyInfo');
    if (!tab) throw new Error('expected companyInfo tab in registry');

    it('matches /admin (pre-redirect URL)', () => {
      expect(tab.isActive('/admin')).toBe(true);
    });

    it('matches /admin/company-info', () => {
      expect(tab.isActive('/admin/company-info')).toBe(true);
    });

    it('matches /admin/company-info/history (forward-compat Chunk C)', () => {
      expect(tab.isActive('/admin/company-info/history')).toBe(true);
    });

    it('matches /admin/company-info/history/<version-id>', () => {
      expect(tab.isActive('/admin/company-info/history/v-abc-123')).toBe(true);
    });

    it('does NOT match /admin/company-information (no naive startsWith)', () => {
      expect(tab.isActive('/admin/company-information')).toBe(false);
    });

    it('does NOT match /', () => {
      expect(tab.isActive('/')).toBe(false);
    });

    it('does NOT match /administration', () => {
      expect(tab.isActive('/administration')).toBe(false);
    });
  });

  describe('brandGuidelines tab', () => {
    const tab = ADMIN_TAB_REGISTRY.find((entry) => entry.id === 'brandGuidelines');
    if (!tab) throw new Error('expected brandGuidelines tab in registry');

    it('is registered with the correct id, labelKey, and href', () => {
      expect(tab.id).toBe('brandGuidelines');
      expect(tab.labelKey).toBe('brandGuidelines');
      expect(tab.href).toBe(ADMIN_BRAND_GUIDELINES_ROUTE);
    });

    it('matches /admin/brand-guidelines exactly', () => {
      expect(tab.isActive('/admin/brand-guidelines')).toBe(true);
    });

    it('matches /admin/brand-guidelines/<brandId>', () => {
      expect(tab.isActive('/admin/brand-guidelines/clxbrand0001')).toBe(true);
    });

    it('does NOT match /admin (the company-info redirect target)', () => {
      expect(tab.isActive('/admin')).toBe(false);
    });

    it('does NOT match /admin/company-info', () => {
      expect(tab.isActive('/admin/company-info')).toBe(false);
    });

    it('does NOT match /admin/brand-guidelines-other (no naive prefix)', () => {
      expect(tab.isActive('/admin/brand-guidelines-other')).toBe(false);
    });
  });

  it('contains exactly two tab entries (companyInfo + brandGuidelines)', () => {
    expect(ADMIN_TAB_REGISTRY).toHaveLength(2);
    expect(ADMIN_TAB_REGISTRY.map((tab) => tab.id)).toEqual([
      'companyInfo',
      'brandGuidelines',
    ]);
  });
});
