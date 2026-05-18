import { describe, expect, it } from 'vitest';
import {
  BRANDS_ENDPOINT,
  BRANDS_QUERY_KEY,
  BRAND_GUIDELINES_SUB_NAV_REGISTRY,
  brandGuidelinesVersionEndpoint,
  brandGuidelinesVersionQueryKey,
  brandGuidelinesVersionsEndpoint,
  brandGuidelinesVersionsQueryKey,
  brandVoiceEndpoint,
  brandVoiceQueryKey,
  visualIdentityEndpoint,
  visualIdentityQueryKey,
  voiceApprovedExamplesEndpoint,
  voiceRejectedExamplesEndpoint,
  voiceRestrictedVocabularyEndpoint,
} from '../constants';

describe('brand-shell constants', () => {
  it('exposes BRANDS_ENDPOINT pointing at api/v1/brands', () => {
    expect(BRANDS_ENDPOINT).toBe('api/v1/brands');
  });

  it('exposes BRANDS_QUERY_KEY as a stable readonly tuple', () => {
    expect(BRANDS_QUERY_KEY).toEqual(['brands', 'list']);
  });

  it('builds the brand voice endpoint for a brand id', () => {
    expect(brandVoiceEndpoint('clxbrand0001')).toBe(
      'api/v1/brands/clxbrand0001/guidelines/voice',
    );
  });

  it('builds the visual identity endpoint for a brand id', () => {
    expect(visualIdentityEndpoint('clxbrand0001')).toBe(
      'api/v1/brands/clxbrand0001/guidelines/visual',
    );
  });

  it('exposes query-key factories scoped per brand', () => {
    expect(brandVoiceQueryKey('clxbrand0001')).toEqual([
      'brand-guidelines',
      'voice',
      'clxbrand0001',
    ]);
    expect(visualIdentityQueryKey('clxbrand0001')).toEqual([
      'brand-guidelines',
      'visual',
      'clxbrand0001',
    ]);
  });

  it('declares the brand guidelines sub-nav registry with the four sub-resources', () => {
    expect(BRAND_GUIDELINES_SUB_NAV_REGISTRY).toHaveLength(4);
    expect(BRAND_GUIDELINES_SUB_NAV_REGISTRY.map((e) => e.id)).toEqual([
      'voice',
      'visual',
      'dosAndDonts',
      'metadata',
    ]);
  });

  it('keeps the sub-nav registry sorted by ascending slot', () => {
    const slots = BRAND_GUIDELINES_SUB_NAV_REGISTRY.map((e) => e.slot);
    expect(slots).toEqual([...slots].sort((a, b) => a - b));
  });

  describe('brand guidelines version endpoint factories', () => {
    it('builds the versions list endpoint', () => {
      expect(brandGuidelinesVersionsEndpoint('clxbrand0001')).toBe(
        'api/v1/brands/clxbrand0001/guidelines/versions',
      );
    });

    it('builds the single-version endpoint', () => {
      expect(brandGuidelinesVersionEndpoint('clxbrand0001', 'clxbgv0001')).toBe(
        'api/v1/brands/clxbrand0001/guidelines/versions/clxbgv0001',
      );
    });

    it('builds the voice standalone read endpoints', () => {
      expect(voiceRestrictedVocabularyEndpoint('b1')).toBe(
        'api/v1/brands/b1/guidelines/voice/restricted-vocabulary',
      );
      expect(voiceApprovedExamplesEndpoint('b1')).toBe(
        'api/v1/brands/b1/guidelines/voice/approved-examples',
      );
      expect(voiceRejectedExamplesEndpoint('b1')).toBe(
        'api/v1/brands/b1/guidelines/voice/rejected-examples',
      );
    });

    it('builds array-prefixed query keys for version cache', () => {
      expect(brandGuidelinesVersionsQueryKey('b1')).toEqual([
        'brand-guidelines',
        'versions',
        'b1',
      ]);
      expect(brandGuidelinesVersionQueryKey('b1', 'v-1')).toEqual([
        'brand-guidelines',
        'versions',
        'b1',
        'v-1',
      ]);
    });
  });
});
