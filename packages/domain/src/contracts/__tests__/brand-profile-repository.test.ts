import { describe, expect, it } from 'vitest';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type IBrandProfileRepository,
} from '../brand-profile-repository';
import type { BrandProfile } from '../../entities/brand-profile';

describe('BRAND_PROFILE_REPOSITORY token', () => {
  it('is a unique symbol so DI registration cannot collide', () => {
    expect(typeof BRAND_PROFILE_REPOSITORY).toBe('symbol');
    expect(BRAND_PROFILE_REPOSITORY.toString()).toContain('BRAND_PROFILE_REPOSITORY');
  });
});

describe('IBrandProfileRepository contract', () => {
  it('is satisfied by an implementation that exposes the documented surface', async () => {
    const sample: BrandProfile = {
      id: 'brand-1',
      ownerSubject: 'subject-1',
      name: 'Brand 1',
      description: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
      updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    };

    const repo: IBrandProfileRepository = {
      async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
        return ownerSubject === 'subject-1' ? [sample] : [];
      },
      async findById(id: string, ownerSubject: string): Promise<BrandProfile | null> {
        return id === sample.id && ownerSubject === sample.ownerSubject ? sample : null;
      },
      async create(input: BrandProfileCreateInput): Promise<BrandProfile> {
        return { ...sample, name: input.name, description: input.description, ownerSubject: input.ownerSubject };
      },
      async update(
        id: string,
        ownerSubject: string,
        patch: BrandProfileUpdatePatch,
      ): Promise<BrandProfile | null> {
        if (id !== sample.id || ownerSubject !== sample.ownerSubject) return null;
        return { ...sample, ...patch } as BrandProfile;
      },
      async delete(id: string, ownerSubject: string): Promise<boolean> {
        return id === sample.id && ownerSubject === sample.ownerSubject;
      },
    };

    await expect(repo.listByOwner('subject-1')).resolves.toEqual([sample]);
    await expect(repo.listByOwner('other')).resolves.toEqual([]);
    await expect(repo.findById('brand-1', 'subject-1')).resolves.toEqual(sample);
    await expect(repo.findById('brand-1', 'other')).resolves.toBeNull();
    await expect(
      repo.create({ ownerSubject: 'subject-1', name: 'Acme', description: 'desc' }),
    ).resolves.toMatchObject({ name: 'Acme', description: 'desc' });
    await expect(
      repo.update('brand-1', 'subject-1', { name: 'Renamed' }),
    ).resolves.toMatchObject({ name: 'Renamed' });
    await expect(repo.update('brand-1', 'other', { name: 'x' })).resolves.toBeNull();
    await expect(repo.delete('brand-1', 'subject-1')).resolves.toBe(true);
    await expect(repo.delete('brand-1', 'other')).resolves.toBe(false);
  });
});
