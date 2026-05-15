import { describe, expect, it } from 'vitest';
import type { BrandProfile } from '../brand-profile';

describe('BrandProfile entity', () => {
  it('accepts a value shape with every documented field populated', () => {
    const value: BrandProfile = {
      id: 'brand-1',
      ownerSubject: 'subject-1',
      name: 'Acme',
      description: 'A test brand',
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };

    expect(value.id).toBe('brand-1');
    expect(value.ownerSubject).toBe('subject-1');
    expect(value.name).toBe('Acme');
    expect(value.description).toBe('A test brand');
    expect(value.createdAt).toBeInstanceOf(Date);
    expect(value.updatedAt).toBeInstanceOf(Date);
  });

  it('allows description to be null', () => {
    const value: BrandProfile = {
      id: 'brand-2',
      ownerSubject: 'subject-1',
      name: 'NoDesc',
      description: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };

    expect(value.description).toBeNull();
  });
});
