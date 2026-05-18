import { toBrand } from '../brand.mapper';
import type { BrandRow } from '../../model/brand-data-model';

describe('toBrand', () => {
  it('maps a row to a Brand domain entity preserving all fields', () => {
    const row: BrandRow = {
      id: 'clxbrand0001',
      name: 'Acme Holdings',
      slug: 'acme-holdings',
      ownerUserId: 'subject-admin',
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T01:00:00.000Z'),
      deletedAt: null,
    };
    expect(toBrand(row)).toEqual(row);
  });

  it('preserves a Date value on deletedAt for soft-deleted rows', () => {
    const row: BrandRow = {
      id: 'clxbrand0002',
      name: 'Gone',
      slug: 'gone',
      ownerUserId: 'subject-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date('2026-05-17T02:00:00.000Z'),
    };
    const mapped = toBrand(row);
    expect(mapped.deletedAt).toBeInstanceOf(Date);
  });
});
