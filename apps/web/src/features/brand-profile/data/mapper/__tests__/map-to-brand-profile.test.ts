import { describe, expect, it } from 'vitest';
import { mapToBrandProfile } from '../map-to-brand-profile';

describe('mapToBrandProfile', () => {
  it('maps the ISO timestamps into Date instances', () => {
    const result = mapToBrandProfile({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: 'a description',
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T11:00:00.000Z',
    });

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2026-05-15T10:00:00.000Z');
    expect(result.updatedAt.toISOString()).toBe('2026-05-15T11:00:00.000Z');
  });

  it('preserves a null description', () => {
    const result = mapToBrandProfile({
      id: 'brand-1',
      ownerSubject: 'sub-1',
      name: 'Acme',
      description: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      updatedAt: '2026-05-15T10:00:00.000Z',
    });

    expect(result.description).toBeNull();
  });
});
