import { describe, expect, it, vi } from 'vitest';
import { BrandGuidelinesVersionPrismaRepository } from '../brand-guidelines-version.repository';

function makeRow(overrides: { id?: string; brandId?: string; createdAt?: Date } = {}): {
  id: string;
  brandId: string;
  snapshot: Record<string, unknown>;
  editorUserId: string;
  editorDisplayName: string;
  changeNote: string | null;
  createdAt: Date;
} {
  return {
    id: overrides.id ?? 'v-1',
    brandId: overrides.brandId ?? 'brand-1',
    snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
    editorUserId: 'u-1',
    editorDisplayName: 'Admin',
    changeNote: null,
    createdAt: overrides.createdAt ?? new Date('2026-05-17T10:00:00.000Z'),
  };
}

function makePrismaStub(opts: {
  findFirst?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  findUnique?: ReturnType<typeof vi.fn>;
}): {
  brandGuidelinesVersion: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
} {
  return {
    brandGuidelinesVersion: {
      findFirst: opts.findFirst ?? vi.fn().mockResolvedValue(null),
      findMany: opts.findMany ?? vi.fn().mockResolvedValue([]),
      findUnique: opts.findUnique ?? vi.fn().mockResolvedValue(null),
    },
  };
}

describe('BrandGuidelinesVersionPrismaRepository.list', () => {
  it('returns empty when no rows exist (no cursor)', async () => {
    const prisma = makePrismaStub({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const result = await repo.list({ brandId: 'brand-1', take: 50 });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('returns empty page when cursor not found (Linear/GitHub semantics)', async () => {
    const prisma = makePrismaStub({ findFirst: vi.fn().mockResolvedValue(null) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const result = await repo.list({ brandId: 'brand-1', take: 50, cursor: 'unknown' });
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(prisma.brandGuidelinesVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'unknown', brandId: 'brand-1' },
    });
  });

  it('trims N+1 fetch and returns nextCursor when more rows exist', async () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' }), makeRow({ id: 'c' })];
    const prisma = makePrismaStub({ findMany: vi.fn().mockResolvedValue(rows) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const result = await repo.list({ brandId: 'brand-1', take: 2 });
    expect(result.items.map((v) => v.id)).toEqual(['a', 'b']);
    expect(result.nextCursor).toBe('b');
    expect(prisma.brandGuidelinesVersion.findMany).toHaveBeenCalledWith({
      where: { brandId: 'brand-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
  });

  it('returns full page + null nextCursor when N+1 fetch had exactly take rows', async () => {
    const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
    const prisma = makePrismaStub({ findMany: vi.fn().mockResolvedValue(rows) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const result = await repo.list({ brandId: 'brand-1', take: 2 });
    expect(result.items.map((v) => v.id)).toEqual(['a', 'b']);
    expect(result.nextCursor).toBeNull();
  });

  it('constructs the OR cursor filter when cursor row is found', async () => {
    const cursorRow = makeRow({ id: 'mid', createdAt: new Date('2026-05-17T05:00:00.000Z') });
    const findManyMock = vi.fn().mockResolvedValue([]);
    const prisma = makePrismaStub({
      findFirst: vi.fn().mockResolvedValue(cursorRow),
      findMany: findManyMock,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    await repo.list({ brandId: 'brand-1', take: 50, cursor: 'mid' });
    const callArg = findManyMock.mock.calls[0]?.[0] as {
      where: { brandId: string; OR?: Array<Record<string, unknown>> };
    };
    expect(callArg.where.brandId).toBe('brand-1');
    expect(callArg.where.OR).toBeDefined();
    expect((callArg.where.OR?.[0] as { createdAt: { lt: Date } }).createdAt.lt).toEqual(
      cursorRow.createdAt,
    );
    expect((callArg.where.OR?.[1] as { id: { lt: string } }).id.lt).toBe('mid');
  });

  it('adds a case-insensitive OR filter on editorName/changeNote when q is provided', async () => {
    const findManyMock = vi.fn().mockResolvedValue([]);
    const prisma = makePrismaStub({ findMany: findManyMock });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    await repo.list({ brandId: 'brand-1', take: 50, q: '  Rebrand  ' });
    const callArg = findManyMock.mock.calls[0]?.[0] as {
      where: { brandId: string; OR?: Array<Record<string, unknown>> };
    };
    expect(callArg.where.OR).toEqual([
      { editorDisplayName: { contains: 'Rebrand', mode: 'insensitive' } },
      { changeNote: { contains: 'Rebrand', mode: 'insensitive' } },
    ]);
  });

  it('skips the q filter when q is empty or whitespace-only', async () => {
    const findManyMock = vi.fn().mockResolvedValue([]);
    const prisma = makePrismaStub({ findMany: findManyMock });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    await repo.list({ brandId: 'brand-1', take: 50, q: '   ' });
    const callArg = findManyMock.mock.calls[0]?.[0] as {
      where: { brandId: string; OR?: Array<Record<string, unknown>> };
    };
    expect(callArg.where.OR).toBeUndefined();
  });
});

describe('BrandGuidelinesVersionPrismaRepository.findById', () => {
  it('returns null when the row is missing', async () => {
    const prisma = makePrismaStub({ findUnique: vi.fn().mockResolvedValue(null) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    expect(await repo.findById('v-x')).toBeNull();
  });

  it('returns the rehydrated version when the row exists', async () => {
    const prisma = makePrismaStub({ findUnique: vi.fn().mockResolvedValue(makeRow()) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const version = await repo.findById('v-1');
    expect(version?.id).toBe('v-1');
    expect(version?.brandId).toBe('brand-1');
  });
});

describe('BrandGuidelinesVersionPrismaRepository.findLatestForBrand', () => {
  it('returns null when no version exists for the brand', async () => {
    const prisma = makePrismaStub({ findFirst: vi.fn().mockResolvedValue(null) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    expect(await repo.findLatestForBrand('brand-x')).toBeNull();
  });

  it('returns the latest version when one exists', async () => {
    const prisma = makePrismaStub({ findFirst: vi.fn().mockResolvedValue(makeRow()) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new BrandGuidelinesVersionPrismaRepository(prisma as any);
    const version = await repo.findLatestForBrand('brand-1');
    expect(version?.id).toBe('v-1');
    expect(prisma.brandGuidelinesVersion.findFirst).toHaveBeenCalledWith({
      where: { brandId: 'brand-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });
});
