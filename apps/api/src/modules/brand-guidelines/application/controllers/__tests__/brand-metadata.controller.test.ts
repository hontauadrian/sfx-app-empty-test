import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  Brand,
  BrandGuidelinesVersionRepository,
  BrandMetadata,
  BrandMetadataRepository,
  BrandRepository,
} from '@sfx/domain';
import { BrandMetadataController } from '../brand-metadata.controller';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';

interface RepoMock {
  findByBrandId: Mock;
  upsertByBrandId: Mock;
}

interface BrandRepoMock {
  listActive: Mock;
  findActiveById: Mock;
  create: Mock;
  renameById: Mock;
  softDeleteById: Mock;
}

interface VersionRepoMock {
  list: Mock;
  findById: Mock;
  findLatestForBrand: Mock;
}

const brand: Brand = {
  id: 'b1',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-owner',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const metadata: BrandMetadata = {
  brandId: 'b1',
  ownerUserId: 'subject-owner',
  lastUpdatedAt: new Date(),
  lastUpdatedByUserId: 'subject-admin',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const adminReq = {
  user: { subject: 'subject-admin', roles: ['admin'], email: 'admin@example.test' },
} as unknown as RequestWithAuthenticatedUser;

describe('BrandMetadataController', () => {
  let repo: RepoMock;
  let brandRepo: BrandRepoMock;
  let versionRepo: VersionRepoMock;
  let controller: BrandMetadataController;

  beforeEach(() => {
    repo = { findByBrandId: vi.fn(), upsertByBrandId: vi.fn() };
    brandRepo = {
      listActive: vi.fn(),
      findActiveById: vi.fn().mockResolvedValue(brand),
      create: vi.fn(),
      renameById: vi.fn(),
      softDeleteById: vi.fn(),
    };
    versionRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findLatestForBrand: vi.fn().mockResolvedValue(null),
    };
    controller = new BrandMetadataController(
      repo as unknown as BrandMetadataRepository,
      brandRepo as unknown as BrandRepository,
      versionRepo as unknown as BrandGuidelinesVersionRepository,
    );
  });

  describe('getMetadata', () => {
    it('returns the existing record with latestVersionId null when no version exists', async () => {
      repo.findByBrandId.mockResolvedValue(metadata);
      const result = await controller.getMetadata('b1', adminReq);
      expect(result).toEqual({ ...metadata, latestVersionId: null });
      expect(repo.upsertByBrandId).not.toHaveBeenCalled();
    });

    it('returns the existing record with latestVersionId populated', async () => {
      repo.findByBrandId.mockResolvedValue(metadata);
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.getMetadata('b1', adminReq);
      expect(result.latestVersionId).toBe('v-1');
    });

    it('auto-creates an empty record when missing', async () => {
      repo.findByBrandId.mockResolvedValue(null);
      repo.upsertByBrandId.mockResolvedValue(metadata);
      const result = await controller.getMetadata('b1', adminReq);
      expect(result.brandId).toBe('b1');
      expect(repo.upsertByBrandId).toHaveBeenCalledWith(
        'b1',
        {},
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        null,
      );
    });

    it('throws 401 when user context missing', async () => {
      const noUser = {} as unknown as RequestWithAuthenticatedUser;
      await expect(controller.getMetadata('b1', noUser)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(controller.getMetadata('missing', adminReq)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('upsertMetadata', () => {
    it('upserts tags, threads null changeNote when absent', async () => {
      repo.upsertByBrandId.mockResolvedValue({ ...metadata, tags: ['en'] });
      const result = await controller.upsertMetadata('b1', { tags: ['en'] }, {}, adminReq);
      expect(result.tags).toEqual(['en']);
      expect(repo.upsertByBrandId).toHaveBeenCalledWith(
        'b1',
        { tags: ['en'] },
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        null,
      );
    });

    it('threads changeNote when provided', async () => {
      repo.upsertByBrandId.mockResolvedValue(metadata);
      await controller.upsertMetadata('b1', { tags: [] }, { changeNote: 'note' }, adminReq);
      expect(repo.upsertByBrandId).toHaveBeenCalledWith(
        'b1',
        { tags: [] },
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        'note',
      );
    });

    it('returns metadata with latestVersionId populated', async () => {
      repo.upsertByBrandId.mockResolvedValue(metadata);
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-2' });
      const result = await controller.upsertMetadata('b1', {}, {}, adminReq);
      expect(result.latestVersionId).toBe('v-2');
    });

    it('throws 401 when user context missing', async () => {
      const noUser = {} as unknown as RequestWithAuthenticatedUser;
      await expect(
        controller.upsertMetadata('b1', {}, {}, noUser),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.upsertMetadata('missing', {}, {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
