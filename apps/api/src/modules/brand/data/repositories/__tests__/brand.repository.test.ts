import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { BrandPrismaRepository } from '../brand.repository';
import type { PrismaClient } from '@sfx/database';

interface PrismaMock {
  brand: {
    findMany: Mock;
    findFirst: Mock;
    count: Mock;
    create: Mock;
    update: Mock;
  };
}

function makePrismaMock(): PrismaMock {
  return {
    brand: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

interface MakeRowOverrides {
  readonly id?: string;
  readonly name?: string;
  readonly slug?: string;
  readonly ownerUserId?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly deletedAt?: Date | null;
}

function makeRow(over: MakeRowOverrides = {}): {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
} {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    deletedAt: null as Date | null,
    ...over,
  };
}

describe('BrandPrismaRepository', () => {
  let prisma: PrismaMock;
  let repo: BrandPrismaRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    repo = new BrandPrismaRepository(prisma as unknown as PrismaClient);
  });

  describe('listActive', () => {
    it('returns active brands newest-first', async () => {
      prisma.brand.findMany.mockResolvedValue([makeRow({ id: 'a' }), makeRow({ id: 'b' })]);
      const result = await repo.listActive();
      expect(result).toHaveLength(2);
      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('returns an empty list when no active brands exist', async () => {
      prisma.brand.findMany.mockResolvedValue([]);
      expect(await repo.listActive()).toEqual([]);
    });
  });

  describe('findActiveById', () => {
    it('returns the mapped brand when present', async () => {
      const row = makeRow();
      prisma.brand.findFirst.mockResolvedValue(row);
      const found = await repo.findActiveById('clxbrand0001');
      expect(found?.id).toBe('clxbrand0001');
      expect(prisma.brand.findFirst).toHaveBeenCalledWith({
        where: { id: 'clxbrand0001', deletedAt: null },
      });
    });

    it('returns null when the row is missing or soft-deleted', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      expect(await repo.findActiveById('missing')).toBeNull();
    });
  });

  describe('create', () => {
    it('derives the natural slug when free and persists the row', async () => {
      prisma.brand.count.mockResolvedValue(0);
      prisma.brand.create.mockResolvedValue(makeRow({ slug: 'acme' }));
      const created = await repo.create({ name: 'Acme' }, 'subject-admin');
      expect(created.slug).toBe('acme');
      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: { name: 'Acme', slug: 'acme', ownerUserId: 'subject-admin' },
      });
    });

    it('appends -2 when the natural slug is taken once', async () => {
      prisma.brand.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      prisma.brand.create.mockResolvedValue(makeRow({ slug: 'acme-2' }));
      const created = await repo.create({ name: 'Acme' }, 'subject-admin');
      expect(created.slug).toBe('acme-2');
    });
  });

  describe('renameById', () => {
    it('returns null when the row is missing', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      expect(await repo.renameById('missing', { name: 'New' })).toBeNull();
    });

    it('returns null when the row is soft-deleted', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      expect(await repo.renameById('deleted', { name: 'New' })).toBeNull();
    });

    it('regenerates a unique slug and updates the row', async () => {
      prisma.brand.findFirst.mockResolvedValue(makeRow());
      prisma.brand.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      prisma.brand.update.mockResolvedValue(makeRow({ name: 'New', slug: 'new-2' }));
      const renamed = await repo.renameById('clxbrand0001', { name: 'New' });
      expect(renamed?.name).toBe('New');
      expect(renamed?.slug).toBe('new-2');
      expect(prisma.brand.count).toHaveBeenCalledWith({
        where: { slug: 'new', deletedAt: null, NOT: { id: 'clxbrand0001' } },
      });
      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'clxbrand0001' },
        data: { name: 'New', slug: 'new-2' },
      });
    });
  });

  describe('softDeleteById', () => {
    it('returns false when the row is missing', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      expect(await repo.softDeleteById('missing')).toBe(false);
      expect(prisma.brand.update).not.toHaveBeenCalled();
    });

    it('returns true and stamps deletedAt + tombstones the slug when active', async () => {
      prisma.brand.findFirst.mockResolvedValue(makeRow());
      prisma.brand.update.mockResolvedValue(makeRow({ deletedAt: new Date() }));
      expect(await repo.softDeleteById('clxbrand0001')).toBe(true);
      const call = prisma.brand.update.mock.calls[0] as unknown as [
        { where: { id: string }; data: { deletedAt: Date; slug: string } },
      ];
      expect(call[0].where).toEqual({ id: 'clxbrand0001' });
      expect(call[0].data.deletedAt).toBeInstanceOf(Date);
      expect(call[0].data.slug).toBe('acme-d-clxbrand0001');
    });
  });
});
