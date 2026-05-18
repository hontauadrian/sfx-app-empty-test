import { describe, expect, it } from 'vitest';
import {
  createBrandSchema,
  renameBrandSchema,
  brandResponseSchema,
  brandIdParamSchema,
} from '../brand.schema';

describe('createBrandSchema', () => {
  it('accepts a valid name', () => {
    const r = createBrandSchema.safeParse({ name: 'Acme Holdings' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Acme Holdings');
  });

  it('trims surrounding whitespace from name', () => {
    const r = createBrandSchema.safeParse({ name: '  Acme  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Acme');
  });

  it('rejects missing name', () => {
    const r = createBrandSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects empty string name with the documented message', () => {
    const r = createBrandSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Name is required')).toBe(true);
    }
  });

  it('rejects whitespace-only name (trim → empty)', () => {
    const r = createBrandSchema.safeParse({ name: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Name is required')).toBe(true);
    }
  });

  it('rejects a 201-character name with the documented message', () => {
    const r = createBrandSchema.safeParse({ name: 'x'.repeat(201) });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'Name must be 200 characters or fewer'),
      ).toBe(true);
    }
  });

  it('accepts a 200-character name', () => {
    expect(createBrandSchema.safeParse({ name: 'x'.repeat(200) }).success).toBe(true);
  });

  it('rejects unknown body keys (.strict)', () => {
    const r = createBrandSchema.safeParse({ name: 'Acme', slug: 'acme' });
    expect(r.success).toBe(false);
  });
});

describe('renameBrandSchema', () => {
  it('mirrors the create schema shape', () => {
    expect(renameBrandSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
    expect(renameBrandSchema.safeParse({}).success).toBe(false);
    expect(renameBrandSchema.safeParse({ name: '' }).success).toBe(false);
    expect(renameBrandSchema.safeParse({ name: 'x', slug: 'y' }).success).toBe(false);
  });
});

describe('brandResponseSchema', () => {
  const sample = {
    id: 'clxbrand0001',
    name: 'Acme Holdings',
    slug: 'acme-holdings',
    ownerUserId: 'subject-admin',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    deletedAt: null as Date | null,
  };

  it('accepts an active brand (deletedAt null)', () => {
    expect(brandResponseSchema.safeParse(sample).success).toBe(true);
  });

  it('accepts a soft-deleted brand (deletedAt Date)', () => {
    expect(
      brandResponseSchema.safeParse({ ...sample, deletedAt: new Date() }).success,
    ).toBe(true);
  });

  it('rejects a slug that is not kebab-case', () => {
    expect(brandResponseSchema.safeParse({ ...sample, slug: 'Acme Holdings' }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys', () => {
    expect(brandResponseSchema.safeParse({ ...sample, extra: 'x' }).success).toBe(false);
  });
});

describe('brandIdParamSchema', () => {
  it('accepts a non-empty id', () => {
    expect(brandIdParamSchema.safeParse({ id: 'clxbrand0001' }).success).toBe(true);
  });

  it('rejects an empty id', () => {
    expect(brandIdParamSchema.safeParse({ id: '' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(brandIdParamSchema.safeParse({ id: 'x', extra: 'y' }).success).toBe(false);
  });
});
