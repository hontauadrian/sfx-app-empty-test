import { describe, expect, it } from 'vitest';
import type { Brand } from '../../entities/brand';
import type { BrandRepository } from '../brand-repository';

describe('BrandRepository port', () => {
  const sample: Brand = {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const repo: BrandRepository = {
    async listActive() {
      return [sample];
    },
    async findActiveById(id) {
      return id === sample.id ? sample : null;
    },
    async create(input, ownerUserId) {
      return { ...sample, name: input.name, ownerUserId };
    },
    async renameById(id, input) {
      return id === sample.id ? { ...sample, name: input.name } : null;
    },
    async softDeleteById(id) {
      return id === sample.id;
    },
  };

  it('listActive returns the active brand list', async () => {
    expect(await repo.listActive()).toHaveLength(1);
  });

  it('findActiveById returns the brand when present', async () => {
    const found = await repo.findActiveById(sample.id);
    expect(found?.id).toBe(sample.id);
  });

  it('findActiveById returns null when missing', async () => {
    expect(await repo.findActiveById('unknown')).toBeNull();
  });

  it('create returns a Brand with the new name and owner', async () => {
    const b = await repo.create({ name: 'New' }, 'subject-2');
    expect(b.name).toBe('New');
    expect(b.ownerUserId).toBe('subject-2');
  });

  it('renameById returns a renamed brand when present', async () => {
    const b = await repo.renameById(sample.id, { name: 'Renamed' });
    expect(b?.name).toBe('Renamed');
  });

  it('renameById returns null when missing', async () => {
    expect(await repo.renameById('unknown', { name: 'X' })).toBeNull();
  });

  it('softDeleteById returns true when an active row is deleted', async () => {
    expect(await repo.softDeleteById(sample.id)).toBe(true);
  });

  it('softDeleteById returns false when the row is missing or already deleted', async () => {
    expect(await repo.softDeleteById('unknown')).toBe(false);
  });
});
