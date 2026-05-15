import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrandProfile,
  IBrandProfileRepository,
  BrandProfileUpdatePatch,
} from '@sfx/domain';
import { BrandProfileController } from '../brand-profile.controller';
import type { AuthenticatedRequest } from '../../../../auth/application/types/authenticated-request';

function buildBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'brand-1',
    ownerSubject: 'sub-1',
    name: 'Acme',
    description: 'A short brand',
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    ...overrides,
  };
}

function buildRequest(subject = 'sub-1'): AuthenticatedRequest {
  return {
    user: { subject, email: 'user@example.com', roles: ['viewer'] },
  } as AuthenticatedRequest;
}

interface RepoMock extends IBrandProfileRepository {
  listByOwner: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function buildRepoMock(): RepoMock {
  return {
    listByOwner: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as RepoMock;
}

describe('BrandProfileController', () => {
  let repository: RepoMock;
  let controller: BrandProfileController;

  beforeEach(() => {
    repository = buildRepoMock();
    controller = new BrandProfileController(repository);
  });

  describe('list', () => {
    it('returns brands owned by the caller serialised with ISO timestamps', async () => {
      const brand = buildBrand();
      repository.listByOwner.mockResolvedValueOnce([brand]);

      const result = await controller.list(buildRequest());

      expect(repository.listByOwner).toHaveBeenCalledWith('sub-1');
      expect(result).toEqual([
        {
          id: brand.id,
          ownerSubject: brand.ownerSubject,
          name: brand.name,
          description: brand.description,
          createdAt: brand.createdAt.toISOString(),
          updatedAt: brand.updatedAt.toISOString(),
        },
      ]);
    });
  });

  describe('create', () => {
    it('persists the brand using the caller subject as owner', async () => {
      const brand = buildBrand({ description: 'desc' });
      repository.create.mockResolvedValueOnce(brand);

      const result = await controller.create(buildRequest(), {
        name: 'Acme',
        description: 'desc',
      });

      expect(repository.create).toHaveBeenCalledWith({
        ownerSubject: 'sub-1',
        name: 'Acme',
        description: 'desc',
      });
      expect(result.id).toBe(brand.id);
    });

    it('treats an undefined description as null when persisting', async () => {
      const brand = buildBrand({ description: null });
      repository.create.mockResolvedValueOnce(brand);

      await controller.create(buildRequest(), { name: 'Acme' });

      expect(repository.create).toHaveBeenCalledWith({
        ownerSubject: 'sub-1',
        name: 'Acme',
        description: null,
      });
    });
  });

  describe('findById', () => {
    it('returns the brand when the repository hands one back', async () => {
      const brand = buildBrand();
      repository.findById.mockResolvedValueOnce(brand);

      const result = await controller.findById(buildRequest(), 'brand-1');

      expect(repository.findById).toHaveBeenCalledWith('brand-1', 'sub-1');
      expect(result.id).toBe('brand-1');
    });

    it('throws NotFoundException when the brand is unknown OR cross-tenant', async () => {
      repository.findById.mockResolvedValueOnce(null);
      await expect(
        controller.findById(buildRequest('sub-other'), 'brand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('returns the updated brand on success', async () => {
      const renamed = buildBrand({ name: 'Renamed' });
      repository.update.mockResolvedValueOnce(renamed);

      const result = await controller.update(buildRequest(), 'brand-1', {
        name: 'Renamed',
      });

      expect(repository.update).toHaveBeenCalledWith('brand-1', 'sub-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
    });

    it('passes an explicit null description through to the repository', async () => {
      const updated = buildBrand({ description: null });
      repository.update.mockResolvedValueOnce(updated);

      await controller.update(buildRequest(), 'brand-1', {
        name: 'Acme',
        description: null,
      });

      const patch = repository.update.mock.calls[0]?.[2] as BrandProfileUpdatePatch;
      expect(patch).toEqual({ name: 'Acme', description: null });
    });

    it('throws NotFoundException when the brand is unknown OR cross-tenant', async () => {
      repository.update.mockResolvedValueOnce(null);
      await expect(
        controller.update(buildRequest('sub-other'), 'brand-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('resolves without a value when delete succeeds', async () => {
      repository.delete.mockResolvedValueOnce(true);
      await expect(controller.remove(buildRequest(), 'brand-1')).resolves.toBeUndefined();
      expect(repository.delete).toHaveBeenCalledWith('brand-1', 'sub-1');
    });

    it('throws NotFoundException when the brand is unknown OR cross-tenant', async () => {
      repository.delete.mockResolvedValueOnce(false);
      await expect(
        controller.remove(buildRequest('sub-other'), 'brand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
