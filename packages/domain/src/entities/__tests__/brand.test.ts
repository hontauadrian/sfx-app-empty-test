import { describe, expect, it } from 'vitest';
import type { Brand, CreateBrandInput, RenameBrandInput } from '../brand';

describe('Brand entity types', () => {
  it('accepts an active Brand value with all required readonly fields', () => {
    const sample: Brand = {
      id: 'clxbrand0001',
      name: 'Acme Holdings',
      slug: 'acme-holdings',
      ownerUserId: 'subject-admin',
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
      deletedAt: null,
    };
    expect(sample.id).toBe('clxbrand0001');
    expect(sample.name).toBe('Acme Holdings');
    expect(sample.slug).toBe('acme-holdings');
    expect(sample.ownerUserId).toBe('subject-admin');
    expect(sample.deletedAt).toBeNull();
    expect(sample.createdAt).toBeInstanceOf(Date);
    expect(sample.updatedAt).toBeInstanceOf(Date);
  });

  it('accepts a soft-deleted Brand value (deletedAt: Date)', () => {
    const sample: Brand = {
      id: 'clxbrand0002',
      name: 'Old',
      slug: 'old',
      ownerUserId: 'subject-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date('2026-05-17T01:00:00.000Z'),
    };
    expect(sample.deletedAt).toBeInstanceOf(Date);
  });

  it('CreateBrandInput accepts { name } only', () => {
    const input: CreateBrandInput = { name: 'Acme' };
    expect(input.name).toBe('Acme');
  });

  it('RenameBrandInput accepts { name } only', () => {
    const input: RenameBrandInput = { name: 'Renamed' };
    expect(input.name).toBe('Renamed');
  });
});
