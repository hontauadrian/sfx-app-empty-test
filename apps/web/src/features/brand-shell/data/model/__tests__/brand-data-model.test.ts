import { describe, expect, it } from 'vitest';
import type { BrandDataModel } from '../brand-data-model';

describe('BrandDataModel', () => {
  it('matches the network shape (ISO strings for dates)', () => {
    const sample: BrandDataModel = {
      id: 'clxbrand0001',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'subject-admin',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
      deletedAt: null,
    };
    expect(sample.id).toBe('clxbrand0001');
    expect(typeof sample.createdAt).toBe('string');
    expect(sample.deletedAt).toBeNull();
  });
});
