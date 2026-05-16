import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { DosAndDontRepository } from '../dos-and-dont.repository';

const NOW = new Date('2026-05-15T00:00:00.000Z');

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e-1',
    brandId: 'b-1',
    type: 'do',
    category: 'tone',
    title: 't',
    body: 'b',
    suggestedCorrection: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface PrismaStub {
  dosAndDontEntry: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  brandProfile: {
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

function makePrisma(): PrismaStub {
  const stub: PrismaStub = {
    dosAndDontEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    brandProfile: {
      update: vi.fn().mockReturnValue({ __brandUpdate: true }),
    },
    $transaction: vi.fn(),
  };
  stub.$transaction.mockImplementation(async (ops: unknown[]) => {
    return Promise.all(ops as Promise<unknown>[]);
  });
  return stub;
}

describe('DosAndDontRepository', () => {
  it('listByBrand without filter orders by category/type/createdAt desc', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findMany.mockResolvedValue([makeRow(), makeRow({ id: 'e-2' })]);
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.listByBrand('b-1');
    expect(result).toHaveLength(2);
    const call = prisma.dosAndDontEntry.findMany.mock.calls[0]?.[0];
    expect(call).toEqual({
      where: { brandId: 'b-1' },
      orderBy: [
        { category: 'asc' },
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  });

  it('listByBrand with filter applies the category filter', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findMany.mockResolvedValue([]);
    const repo = new DosAndDontRepository(prisma as never);
    await repo.listByBrand('b-1', { category: 'tone' });
    const call = prisma.dosAndDontEntry.findMany.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ brandId: 'b-1', category: 'tone' });
  });

  it('findById uses where { id, brandId } so cross-brand ids return null', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce(makeRow());
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.findById('b-1', 'e-1');
    expect(result?.id).toBe('e-1');
    expect(prisma.dosAndDontEntry.findFirst).toHaveBeenCalledWith({
      where: { id: 'e-1', brandId: 'b-1' },
    });
  });

  it('findById returns null when no row matches', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce(null);
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.findById('b-1', 'missing');
    expect(result).toBeNull();
  });

  it('create wraps the insert and the brand-updatedAt bump in $transaction', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.create.mockReturnValueOnce(makeRow());
    const repo = new DosAndDontRepository(prisma as never);
    const created = await repo.create({
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
    });
    expect(created.brandId).toBe('b-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: {},
    });
  });

  it('update returns null when the entry is not on the brand', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce(null);
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.update('b-1', 'missing', {
      type: 'do',
      category: 'tone',
      title: 't',
      body: 'b',
      suggestedCorrection: null,
    });
    expect(result).toBeNull();
    expect(prisma.dosAndDontEntry.update).not.toHaveBeenCalled();
  });

  it('update writes the patch and bumps brand updatedAt in $transaction', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce({ id: 'e-1' });
    prisma.dosAndDontEntry.update.mockReturnValueOnce(
      makeRow({ title: 'updated' }),
    );
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.update('b-1', 'e-1', {
      type: 'dont',
      category: 'legal',
      title: 'updated',
      body: 'b2',
      suggestedCorrection: 'fix',
    });
    expect(result?.title).toBe('updated');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: {},
    });
  });

  it('delete returns false when the entry is not on the brand', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce(null);
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.delete('b-1', 'missing');
    expect(result).toBe(false);
    expect(prisma.dosAndDontEntry.delete).not.toHaveBeenCalled();
  });

  it('delete returns true and bumps brand updatedAt in $transaction', async () => {
    const prisma = makePrisma();
    prisma.dosAndDontEntry.findFirst.mockResolvedValueOnce({ id: 'e-1' });
    const repo = new DosAndDontRepository(prisma as never);
    const result = await repo.delete('b-1', 'e-1');
    expect(result).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dosAndDontEntry.delete).toHaveBeenCalledWith({
      where: { id: 'e-1' },
    });
    expect(prisma.brandProfile.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: {},
    });
  });
});
