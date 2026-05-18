import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  Brand,
  BrandGuidelinesVersionRepository,
  BrandRepository,
  DosDontsEntry,
  DosDontsRepository,
} from '@sfx/domain';
import { DosAndDontsController } from '../dos-and-donts.controller';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';

interface RepoMock {
  listByBrand: Mock;
  findByIdInBrand: Mock;
  createInBrand: Mock;
  updateInBrandById: Mock;
  deleteInBrandById: Mock;
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

function makeRepoMock(): RepoMock {
  return {
    listByBrand: vi.fn(),
    findByIdInBrand: vi.fn(),
    createInBrand: vi.fn(),
    updateInBrandById: vi.fn(),
    deleteInBrandById: vi.fn(),
  };
}

function makeBrandRepoMock(): BrandRepoMock {
  return {
    listActive: vi.fn(),
    findActiveById: vi.fn(),
    create: vi.fn(),
    renameById: vi.fn(),
    softDeleteById: vi.fn(),
  };
}

function makeVersionRepoMock(): VersionRepoMock {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findLatestForBrand: vi.fn().mockResolvedValue(null),
  };
}

const brand: Brand = {
  id: 'b1',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-owner',
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  deletedAt: null,
};

const entry: DosDontsEntry = {
  id: 'dd1',
  brandId: 'b1',
  type: 'do',
  category: 'tone',
  ruleText: 'rule',
  exampleText: null,
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T00:00:00.000Z'),
};

const adminReq = {
  user: { subject: 'subject-admin', roles: ['admin'], email: 'admin@example.test' },
} as unknown as RequestWithAuthenticatedUser;

const expectedEditor = {
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
};

describe('DosAndDontsController', () => {
  let repo: RepoMock;
  let brandRepo: BrandRepoMock;
  let versionRepo: VersionRepoMock;
  let controller: DosAndDontsController;

  beforeEach(() => {
    repo = makeRepoMock();
    brandRepo = makeBrandRepoMock();
    versionRepo = makeVersionRepoMock();
    controller = new DosAndDontsController(
      repo as unknown as DosDontsRepository,
      brandRepo as unknown as BrandRepository,
      versionRepo as unknown as BrandGuidelinesVersionRepository,
    );
    brandRepo.findActiveById.mockResolvedValue(brand);
  });

  describe('listEntries', () => {
    it('returns wrapped items + latestVersionId null when none', async () => {
      repo.listByBrand.mockResolvedValue([entry]);
      expect(await controller.listEntries('b1', {})).toEqual({
        items: [entry],
        latestVersionId: null,
      });
    });

    it('returns latestVersionId when version exists', async () => {
      repo.listByBrand.mockResolvedValue([]);
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.listEntries('b1', {});
      expect(result.latestVersionId).toBe('v-1');
    });

    it('forwards filters to the repository', async () => {
      repo.listByBrand.mockResolvedValue([]);
      await controller.listEntries('b1', { type: 'dont', category: 'legal' });
      expect(repo.listByBrand).toHaveBeenCalledWith('b1', { type: 'dont', category: 'legal' });
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(controller.listEntries('missing', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createEntry', () => {
    it('creates and returns the entry; threads editor + null changeNote', async () => {
      repo.createInBrand.mockResolvedValue(entry);
      expect(
        await controller.createEntry(
          'b1',
          { type: 'do', category: 'tone', ruleText: 'rule' },
          {},
          adminReq,
        ),
      ).toEqual(entry);
      expect(repo.createInBrand).toHaveBeenCalledWith(
        'b1',
        { type: 'do', category: 'tone', ruleText: 'rule' },
        expectedEditor,
        null,
      );
    });

    it('threads changeNote when provided', async () => {
      repo.createInBrand.mockResolvedValue(entry);
      await controller.createEntry(
        'b1',
        { type: 'do', category: 'tone', ruleText: 'rule' },
        { changeNote: 'first' },
        adminReq,
      );
      expect(repo.createInBrand).toHaveBeenCalledWith(
        'b1',
        { type: 'do', category: 'tone', ruleText: 'rule' },
        expectedEditor,
        'first',
      );
    });

    it('throws 401 when user context missing', async () => {
      const reqNoUser = {} as unknown as RequestWithAuthenticatedUser;
      await expect(
        controller.createEntry(
          'b1',
          { type: 'do', category: 'tone', ruleText: 'rule' },
          {},
          reqNoUser,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.createEntry(
          'missing',
          { type: 'do', category: 'tone', ruleText: 'rule' },
          {},
          adminReq,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateEntry', () => {
    it('returns the updated entry', async () => {
      repo.updateInBrandById.mockResolvedValue({ ...entry, ruleText: 'new' });
      const result = await controller.updateEntry(
        'b1',
        'dd1',
        { ruleText: 'new' },
        {},
        adminReq,
      );
      expect(result.ruleText).toBe('new');
      expect(repo.updateInBrandById).toHaveBeenCalledWith(
        'b1',
        'dd1',
        { ruleText: 'new' },
        expectedEditor,
        null,
      );
    });

    it('threads changeNote', async () => {
      repo.updateInBrandById.mockResolvedValue(entry);
      await controller.updateEntry('b1', 'dd1', {}, { changeNote: 'update' }, adminReq);
      expect(repo.updateInBrandById).toHaveBeenCalledWith(
        'b1',
        'dd1',
        {},
        expectedEditor,
        'update',
      );
    });

    it('throws 404 when entry missing', async () => {
      repo.updateInBrandById.mockResolvedValue(null);
      await expect(
        controller.updateEntry('b1', 'dd1', {}, {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.updateEntry('missing', 'dd1', {}, {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 401 when user missing', async () => {
      const reqNoUser = {} as unknown as RequestWithAuthenticatedUser;
      await expect(
        controller.updateEntry('b1', 'dd1', {}, {}, reqNoUser),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('deleteEntry', () => {
    it('returns void on success and forwards editor + changeNote', async () => {
      repo.deleteInBrandById.mockResolvedValue(true);
      await expect(controller.deleteEntry('b1', 'dd1', {}, adminReq)).resolves.toBeUndefined();
      expect(repo.deleteInBrandById).toHaveBeenCalledWith('b1', 'dd1', expectedEditor, null);
    });

    it('threads changeNote on delete', async () => {
      repo.deleteInBrandById.mockResolvedValue(true);
      await controller.deleteEntry('b1', 'dd1', { changeNote: 'removed' }, adminReq);
      expect(repo.deleteInBrandById).toHaveBeenCalledWith(
        'b1',
        'dd1',
        expectedEditor,
        'removed',
      );
    });

    it('throws 404 when entry missing', async () => {
      repo.deleteInBrandById.mockResolvedValue(false);
      await expect(controller.deleteEntry('b1', 'dd1', {}, adminReq)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when brand missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.deleteEntry('missing', 'dd1', {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 401 when user missing', async () => {
      const reqNoUser = {} as unknown as RequestWithAuthenticatedUser;
      await expect(
        controller.deleteEntry('b1', 'dd1', {}, reqNoUser),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
