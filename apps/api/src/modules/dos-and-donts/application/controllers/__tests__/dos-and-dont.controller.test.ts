import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrandProfile,
  DosAndDontEntry,
  IBrandProfileRepository,
  IDosAndDontRepository,
} from '@sfx/domain';
import { DosAndDontController } from '../dos-and-dont.controller';
import type { AuthenticatedRequest } from '../../../../auth/application/types/authenticated-request';

function buildBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'b-1',
    ownerSubject: 'admin',
    name: 'Acme',
    description: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    ...overrides,
  };
}

function buildEntry(overrides: Partial<DosAndDontEntry> = {}): DosAndDontEntry {
  return {
    id: 'e-1',
    brandId: 'b-1',
    type: 'do',
    category: 'tone',
    title: 'Use active voice',
    body: 'Prefer active.',
    suggestedCorrection: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    ...overrides,
  };
}

function buildRequest(subject = 'admin'): AuthenticatedRequest {
  return { user: { subject, email: 'a@b.co', roles: ['viewer'] } } as AuthenticatedRequest;
}

interface BrandRepoMock extends IBrandProfileRepository {
  findById: ReturnType<typeof vi.fn>;
  listByOwner: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface DosRepoMock extends IDosAndDontRepository {
  listByBrand: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function buildBrandRepoMock(): BrandRepoMock {
  return {
    findById: vi.fn(),
    listByOwner: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as BrandRepoMock;
}

function buildDosRepoMock(): DosRepoMock {
  return {
    listByBrand: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as DosRepoMock;
}

describe('DosAndDontController', () => {
  let brandRepo: BrandRepoMock;
  let dosRepo: DosRepoMock;
  let controller: DosAndDontController;

  beforeEach(() => {
    brandRepo = buildBrandRepoMock();
    dosRepo = buildDosRepoMock();
    controller = new DosAndDontController(brandRepo, dosRepo);
  });

  describe('list', () => {
    it('returns mapped entries on the happy path', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.listByBrand.mockResolvedValueOnce([buildEntry(), buildEntry({ id: 'e-2' })]);
      const result = await controller.list(buildRequest(), 'b-1', { category: undefined });
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('e-1');
      expect(brandRepo.findById).toHaveBeenCalledWith('b-1', 'admin');
      expect(dosRepo.listByBrand).toHaveBeenCalledWith('b-1', undefined);
    });

    it('passes the category filter through to the repository', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.listByBrand.mockResolvedValueOnce([]);
      await controller.list(buildRequest(), 'b-1', { category: 'tone' });
      expect(dosRepo.listByBrand).toHaveBeenCalledWith('b-1', { category: 'tone' });
    });

    it('throws 404 when the brand is missing / cross-tenant', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.list(buildRequest('viewer'), 'b-1', { category: undefined }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dosRepo.listByBrand).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates the entry on the happy path', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.create.mockResolvedValueOnce(buildEntry());
      const result = await controller.create(buildRequest(), 'b-1', {
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: undefined,
      });
      expect(result.id).toBe('e-1');
      expect(dosRepo.create).toHaveBeenCalledWith({
        brandId: 'b-1',
        type: 'do',
        category: 'tone',
        title: 't',
        body: 'b',
        suggestedCorrection: null,
      });
    });

    it('normalises a populated suggestedCorrection through', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.create.mockResolvedValueOnce(buildEntry({ suggestedCorrection: 'fix' }));
      const result = await controller.create(buildRequest(), 'b-1', {
        type: 'dont',
        category: 'visuals',
        title: 't',
        body: 'b',
        suggestedCorrection: 'fix',
      });
      expect(result.suggestedCorrection).toBe('fix');
      const callArg = dosRepo.create.mock.calls[0]?.[0];
      expect(callArg.suggestedCorrection).toBe('fix');
    });

    it('throws 404 when the brand is missing / cross-tenant', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.create(buildRequest('viewer'), 'b-1', {
          type: 'do',
          category: 'tone',
          title: 't',
          body: 'b',
          suggestedCorrection: undefined,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dosRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the mapped DTO on the happy path', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.findById.mockResolvedValueOnce(buildEntry());
      const result = await controller.findById(buildRequest(), 'b-1', 'e-1');
      expect(result.id).toBe('e-1');
    });

    it('throws 404 when the brand is missing', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.findById(buildRequest('viewer'), 'b-1', 'e-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dosRepo.findById).not.toHaveBeenCalled();
    });

    it('throws 404 when the entry is missing', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.findById(buildRequest(), 'b-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates the entry on the happy path', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.update.mockResolvedValueOnce(buildEntry({ title: 'new' }));
      const result = await controller.update(buildRequest(), 'b-1', 'e-1', {
        type: 'do',
        category: 'tone',
        title: 'new',
        body: 'b',
        suggestedCorrection: null,
      });
      expect(result.title).toBe('new');
    });

    it('throws 404 when the brand is missing', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.update(buildRequest('viewer'), 'b-1', 'e-1', {
          type: 'do',
          category: 'tone',
          title: 't',
          body: 'b',
          suggestedCorrection: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dosRepo.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the repository returns null (entry missing)', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.update.mockResolvedValueOnce(null);
      await expect(
        controller.update(buildRequest(), 'b-1', 'missing', {
          type: 'do',
          category: 'tone',
          title: 't',
          body: 'b',
          suggestedCorrection: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes the entry on the happy path (no return body)', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.delete.mockResolvedValueOnce(true);
      const result = await controller.remove(buildRequest(), 'b-1', 'e-1');
      expect(result).toBeUndefined();
      expect(dosRepo.delete).toHaveBeenCalledWith('b-1', 'e-1');
    });

    it('throws 404 when the brand is missing', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.remove(buildRequest('viewer'), 'b-1', 'e-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dosRepo.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the repository reports no delete (entry missing)', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      dosRepo.delete.mockResolvedValueOnce(false);
      await expect(
        controller.remove(buildRequest(), 'b-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
