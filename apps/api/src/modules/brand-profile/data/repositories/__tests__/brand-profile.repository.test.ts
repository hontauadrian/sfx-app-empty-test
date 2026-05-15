import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient, BrandProfile as PrismaBrandProfile } from '@sfx/database';
import { BrandProfileRepository } from '../brand-profile.repository';

type PrismaMock = {
  brandProfile: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

function buildPrismaMock(): PrismaMock {
  return {
    brandProfile: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
}

function buildRow(overrides: Partial<PrismaBrandProfile> = {}): PrismaBrandProfile {
  return {
    id: 'brand-1',
    ownerSubject: 'sub-1',
    name: 'Acme',
    description: 'desc',
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  } as PrismaBrandProfile;
}

describe('BrandProfileRepository', () => {
  let prisma: PrismaMock;
  let repo: BrandProfileRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new BrandProfileRepository(prisma as unknown as PrismaClient);
  });

  describe('listByOwner', () => {
    it('returns rows filtered by owner subject, ordered by updatedAt DESC', async () => {
      const row = buildRow();
      prisma.brandProfile.findMany.mockResolvedValueOnce([row]);

      const result = await repo.listByOwner('sub-1');

      expect(prisma.brandProfile.findMany).toHaveBeenCalledWith({
        where: { ownerSubject: 'sub-1' },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual([
        {
          id: row.id,
          ownerSubject: row.ownerSubject,
          name: row.name,
          description: row.description,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      ]);
    });

    it('returns an empty list when the owner has no brands', async () => {
      prisma.brandProfile.findMany.mockResolvedValueOnce([]);
      await expect(repo.listByOwner('sub-empty')).resolves.toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns the brand when id and owner match', async () => {
      const row = buildRow();
      prisma.brandProfile.findFirst.mockResolvedValueOnce(row);

      const result = await repo.findById('brand-1', 'sub-1');

      expect(prisma.brandProfile.findFirst).toHaveBeenCalledWith({
        where: { id: 'brand-1', ownerSubject: 'sub-1' },
      });
      expect(result?.id).toBe('brand-1');
    });

    it('returns null when the brand does not exist OR is owned by a different user', async () => {
      prisma.brandProfile.findFirst.mockResolvedValueOnce(null);
      await expect(repo.findById('brand-1', 'sub-other')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('persists the brand with the caller as owner', async () => {
      const row = buildRow({ description: null });
      prisma.brandProfile.create.mockResolvedValueOnce(row);

      const result = await repo.create({
        ownerSubject: 'sub-1',
        name: 'Acme',
        description: null,
      });

      expect(prisma.brandProfile.create).toHaveBeenCalledWith({
        data: { ownerSubject: 'sub-1', name: 'Acme', description: null },
      });
      expect(result.description).toBeNull();
    });
  });

  describe('update', () => {
    it('updates and returns the row when owner matches', async () => {
      const row = buildRow({ name: 'Renamed' });
      prisma.brandProfile.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.brandProfile.findUnique.mockResolvedValueOnce(row);

      const result = await repo.update('brand-1', 'sub-1', { name: 'Renamed' });

      expect(prisma.brandProfile.updateMany).toHaveBeenCalledWith({
        where: { id: 'brand-1', ownerSubject: 'sub-1' },
        data: { name: 'Renamed' },
      });
      expect(result?.name).toBe('Renamed');
    });

    it('returns null when no row matches (not found OR not owned)', async () => {
      prisma.brandProfile.updateMany.mockResolvedValueOnce({ count: 0 });
      const result = await repo.update('brand-1', 'sub-other', { name: 'x' });
      expect(result).toBeNull();
      expect(prisma.brandProfile.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when updateMany succeeded but the row vanished between reads', async () => {
      prisma.brandProfile.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.brandProfile.findUnique.mockResolvedValueOnce(null);
      const result = await repo.update('brand-1', 'sub-1', { name: 'x' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns true when a row was removed', async () => {
      prisma.brandProfile.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(repo.delete('brand-1', 'sub-1')).resolves.toBe(true);
      expect(prisma.brandProfile.deleteMany).toHaveBeenCalledWith({
        where: { id: 'brand-1', ownerSubject: 'sub-1' },
      });
    });

    it('returns false when no row matched (not found OR not owned)', async () => {
      prisma.brandProfile.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(repo.delete('brand-1', 'sub-other')).resolves.toBe(false);
    });
  });
});
