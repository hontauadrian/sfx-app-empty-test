import { describe, expect, it } from 'vitest';
import {
  BRAND_DESCRIPTION_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  brandProfileSchema,
  brandProfileWriteSchema,
} from '../brand-profile.schema';

describe('brandProfileWriteSchema', () => {
  it('accepts a minimal valid payload (name only)', () => {
    const result = brandProfileWriteSchema.safeParse({ name: 'Acme' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Acme');
      expect(result.data.description).toBeUndefined();
    }
  });

  it('trims surrounding whitespace from name', () => {
    const result = brandProfileWriteSchema.safeParse({ name: '  Spaced  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Spaced');
  });

  it('rejects an empty name', () => {
    const result = brandProfileWriteSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name (after trim it collapses to empty)', () => {
    const result = brandProfileWriteSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it(`rejects name longer than ${BRAND_NAME_MAX_LENGTH} characters`, () => {
    const result = brandProfileWriteSchema.safeParse({ name: 'a'.repeat(BRAND_NAME_MAX_LENGTH + 1) });
    expect(result.success).toBe(false);
  });

  it(`accepts name exactly ${BRAND_NAME_MAX_LENGTH} characters`, () => {
    const result = brandProfileWriteSchema.safeParse({ name: 'a'.repeat(BRAND_NAME_MAX_LENGTH) });
    expect(result.success).toBe(true);
  });

  it('accepts description up to the documented maximum', () => {
    const result = brandProfileWriteSchema.safeParse({
      name: 'Acme',
      description: 'd'.repeat(BRAND_DESCRIPTION_MAX_LENGTH),
    });
    expect(result.success).toBe(true);
  });

  it(`rejects description longer than ${BRAND_DESCRIPTION_MAX_LENGTH} characters`, () => {
    const result = brandProfileWriteSchema.safeParse({
      name: 'Acme',
      description: 'd'.repeat(BRAND_DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('accepts null description (clears the field on PUT)', () => {
    const result = brandProfileWriteSchema.safeParse({ name: 'Acme', description: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });
});

describe('brandProfileSchema', () => {
  it('accepts a fully-populated brand resource shape', () => {
    const result = brandProfileSchema.safeParse({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: 'a description',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null description on the response shape', () => {
    const result = brandProfileSchema.safeParse({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing id', () => {
    const result = brandProfileSchema.safeParse({
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
