import { describe, expect, it } from 'vitest';
import { mapToBrand, mapToBrandList } from '../map-to-brand';
import type { BrandDataModel } from '../../model/brand-data-model';

const sample: BrandDataModel = {
  id: 'clxbrand0001',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-admin',
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T01:00:00.000Z',
  deletedAt: null,
};

describe('mapToBrand', () => {
  it('converts ISO strings to Date for createdAt/updatedAt', () => {
    const mapped = mapToBrand(sample);
    expect(mapped.createdAt).toBeInstanceOf(Date);
    expect(mapped.updatedAt).toBeInstanceOf(Date);
    expect(mapped.createdAt.toISOString()).toBe('2026-05-17T00:00:00.000Z');
  });

  it('passes deletedAt through as null when null on the network', () => {
    expect(mapToBrand(sample).deletedAt).toBeNull();
  });

  it('converts deletedAt ISO string to Date when present', () => {
    const mapped = mapToBrand({ ...sample, deletedAt: '2026-05-17T02:00:00.000Z' });
    expect(mapped.deletedAt).toBeInstanceOf(Date);
  });
});

describe('mapToBrandList', () => {
  it('maps each entry and preserves order', () => {
    const list = mapToBrandList([
      sample,
      { ...sample, id: 'clxbrand0002', name: 'Other' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe('clxbrand0001');
    expect(list[1]?.name).toBe('Other');
  });

  it('returns an empty list when given an empty array', () => {
    expect(mapToBrandList([])).toEqual([]);
  });
});
