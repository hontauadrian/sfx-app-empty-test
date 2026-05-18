import { describe, expect, it } from 'vitest';
import {
  mapToVisualIdentity,
  mapToVisualIdentityOrNull,
} from '../map-to-visual-identity';
import type { VisualIdentityDataModel } from '../../model/visual-identity-data-model';

const sample: VisualIdentityDataModel = {
  brandId: 'clxbrand0001',
  logoUsage: 'Default',
  colorPalette: [{ name: 'Primary', hex: 'PrimaryHex', usageNotes: null }],
  typography: [{ font: 'Inter', weight: '500', usageContext: null }],
  spacingGuidance: '',
  imageStyleGuidance: '',
  iconographyGuidance: '',
  usageRestrictions: '',
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T01:00:00.000Z',
};

describe('mapToVisualIdentity', () => {
  it('converts ISO strings to Date instances', () => {
    const value = mapToVisualIdentity(sample);
    expect(value.createdAt).toBeInstanceOf(Date);
  });

  it('passes through every list and scalar', () => {
    const value = mapToVisualIdentity(sample);
    expect(value.logoUsage).toBe('Default');
    expect(value.colorPalette[0]?.name).toBe('Primary');
  });

  it('propagates Invalid Date when timestamp is malformed', () => {
    const value = mapToVisualIdentity({ ...sample, updatedAt: 'broken' });
    expect(Number.isNaN(value.updatedAt.getTime())).toBe(true);
  });
});

describe('mapToVisualIdentityOrNull', () => {
  it('returns null for null input', () => {
    expect(mapToVisualIdentityOrNull(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(mapToVisualIdentityOrNull(undefined)).toBeNull();
  });

  it('maps populated input', () => {
    const value = mapToVisualIdentityOrNull(sample);
    expect(value?.brandId).toBe('clxbrand0001');
  });
});
