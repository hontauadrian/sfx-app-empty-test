import type { BrandRow } from '../brand-data-model';

describe('BrandRow type alias', () => {
  it('is a structural row matching the Brand model fields', () => {
    const row: BrandRow = {
      id: 'clxbrand0001',
      name: 'Acme',
      slug: 'acme',
      ownerUserId: 'subject-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    expect(row.id).toBe('clxbrand0001');
    expect(row.deletedAt).toBeNull();
  });
});
