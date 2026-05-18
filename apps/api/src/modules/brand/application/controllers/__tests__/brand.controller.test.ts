import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { Brand, BrandRepository } from '@sfx/domain';
import { BrandController } from '../brand.controller';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';

type RepoMock = {
  listActive: Mock;
  findActiveById: Mock;
  create: Mock;
  renameById: Mock;
  softDeleteById: Mock;
};

function makeRepoMock(): RepoMock {
  return {
    listActive: vi.fn(),
    findActiveById: vi.fn(),
    create: vi.fn(),
    renameById: vi.fn(),
    softDeleteById: vi.fn(),
  };
}

function sample(over: Partial<Brand> = {}): Brand {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

const adminReq = {
  user: { subject: 'subject-admin', roles: ['admin'], email: 'admin@example.test' },
} as unknown as RequestWithAuthenticatedUser;

describe('BrandController', () => {
  let repo: RepoMock;
  let controller: BrandController;

  beforeEach(() => {
    repo = makeRepoMock();
    controller = new BrandController(repo as unknown as BrandRepository);
  });

  describe('listBrands', () => {
    it('returns the wrapped active brand list', async () => {
      repo.listActive.mockResolvedValue([sample(), sample({ id: 'b' })]);
      expect(await controller.listBrands()).toEqual({
        brands: [sample(), sample({ id: 'b' })],
      });
    });

    it('returns an empty brands array when no brands exist', async () => {
      repo.listActive.mockResolvedValue([]);
      expect(await controller.listBrands()).toEqual({ brands: [] });
    });
  });

  describe('createBrand', () => {
    it('persists a brand and returns it on the happy path', async () => {
      repo.create.mockResolvedValue(sample());
      const result = await controller.createBrand({ name: 'Acme' }, adminReq);
      expect(result).toEqual(sample());
      expect(repo.create).toHaveBeenCalledWith({ name: 'Acme' }, 'subject-admin');
    });

    it('throws UnauthorizedException when req.user is missing', async () => {
      const req = {} as RequestWithAuthenticatedUser;
      await expect(controller.createBrand({ name: 'Acme' }, req)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('renameBrand', () => {
    it('returns the renamed brand on the happy path', async () => {
      repo.renameById.mockResolvedValue(sample({ name: 'Renamed', slug: 'renamed' }));
      const renamed = await controller.renameBrand('clxbrand0001', { name: 'Renamed' });
      expect(renamed.name).toBe('Renamed');
      expect(renamed.slug).toBe('renamed');
    });

    it('throws NotFoundException when the repository returns null', async () => {
      repo.renameById.mockResolvedValue(null);
      await expect(
        controller.renameBrand('missing', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('binds @ApiBody so the runtime probe can reach the 404 branch', () => {
      const bodyMetadata = Reflect.getMetadata(
        'swagger/apiParameters',
        BrandController.prototype.renameBrand,
      ) as Array<{ in?: string; schema?: { $ref?: string } }> | undefined;
      const bodyEntry = bodyMetadata?.find((entry) => entry?.in === 'body');
      expect(bodyEntry).toBeDefined();
      expect(bodyEntry?.schema?.$ref).toBe('#/components/schemas/RenameBrandInput');
    });
  });

  describe('deleteBrand', () => {
    it('resolves void when the row is soft-deleted', async () => {
      repo.softDeleteById.mockResolvedValue(true);
      await expect(controller.deleteBrand('clxbrand0001')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when softDeleteById returns false', async () => {
      repo.softDeleteById.mockResolvedValue(false);
      await expect(controller.deleteBrand('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
