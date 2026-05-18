import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { CompanyInfoEditor, UpsertCompanyInfoInput } from '@sfx/domain';
import type { PrismaClient } from '@sfx/database';
import { CompanyInfoPrismaRepository } from '../company-info.repository';

type PrismaShim = {
  companyInfo: {
    findFirst: Mock;
    create: Mock;
    update: Mock;
  };
  companyInfoVersion: {
    findUnique: Mock;
    findMany: Mock;
    create: Mock;
  };
  $transaction: Mock;
};

const makePrismaShim = (): PrismaShim => {
  const shim: PrismaShim = {
    companyInfo: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    companyInfoVersion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(shim)),
  };
  return shim;
};

const ADMIN_EDITOR: CompanyInfoEditor = {
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
};

const buildRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'cuid-1',
  legalName: 'Acme',
  tradingName: null,
  email: null,
  phone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  country: null,
  taxId: null,
  registrationNumber: null,
  companyName: null,
  foundedYear: null,
  teamSize: null,
  industry: null,
  missionStatement: null,
  visionStatement: null,
  coreValues: [],
  certifications: [],
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  ...overrides,
});

const buildVersionRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'v-1',
  companyInfoId: 'cuid-1',
  snapshot: {
    id: 'cuid-1',
    legalName: 'Acme',
    tradingName: null,
    email: null,
    phone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    taxId: null,
    registrationNumber: null,
    companyName: null,
    foundedYear: null,
    teamSize: null,
    industry: null,
    missionStatement: null,
    visionStatement: null,
    coreValues: [],
    certifications: [],
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
  },
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  ...overrides,
});

describe('CompanyInfoPrismaRepository.findSingleton', () => {
  it('returns a mapped CompanyInfo when findFirst yields a row', async () => {
    const shim = makePrismaShim();
    const row = buildRow({ legalName: 'Acme Holdings SRL' });
    shim.companyInfo.findFirst.mockResolvedValue(row);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);

    await expect(repo.findSingleton()).resolves.toEqual({ ...row });
    expect(shim.companyInfo.findFirst).toHaveBeenCalledTimes(1);
    expect(shim.companyInfo.findFirst).toHaveBeenCalledWith();
  });

  it('returns null when findFirst yields null', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(null);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);

    await expect(repo.findSingleton()).resolves.toBeNull();
    expect(shim.companyInfo.create).not.toHaveBeenCalled();
    expect(shim.companyInfo.update).not.toHaveBeenCalled();
  });

  it('propagates findFirst rejections', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockRejectedValue(new Error('db down'));

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);

    await expect(repo.findSingleton()).rejects.toThrow('db down');
  });
});

describe('CompanyInfoPrismaRepository.upsertSingleton', () => {
  const input: UpsertCompanyInfoInput = {
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
  };

  it('runs find + write inside prisma.$transaction', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(buildRow({ legalName: input.legalName }));
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);

    await repo.upsertSingleton(input, ADMIN_EDITOR);

    expect(shim.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof shim.$transaction.mock.calls[0]?.[0]).toBe('function');
  });

  it('creates when no record exists, omitting id/createdAt/updatedAt', async () => {
    const shim = makePrismaShim();
    const createdRow = buildRow({ legalName: input.legalName, tradingName: 'Acme' });
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(createdRow);
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.upsertSingleton(input, ADMIN_EDITOR);

    expect(shim.companyInfo.create).toHaveBeenCalledTimes(1);
    expect(shim.companyInfo.update).not.toHaveBeenCalled();
    const createArg = shim.companyInfo.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArg.data).toEqual({ legalName: input.legalName, tradingName: 'Acme' });
    expect('id' in createArg.data).toBe(false);
    expect('createdAt' in createArg.data).toBe(false);
    expect('updatedAt' in createArg.data).toBe(false);
    expect(result).toEqual({ ...createdRow });
  });

  it('updates by existing id when a record exists', async () => {
    const shim = makePrismaShim();
    const existing = buildRow({ id: 'cuid-existing' });
    const updated = buildRow({ id: 'cuid-existing', legalName: 'Updated' });
    shim.companyInfo.findFirst.mockResolvedValue(existing);
    shim.companyInfo.update.mockResolvedValue(updated);
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.upsertSingleton({ legalName: 'Updated' }, ADMIN_EDITOR);

    expect(shim.companyInfo.update).toHaveBeenCalledTimes(1);
    expect(shim.companyInfo.create).not.toHaveBeenCalled();
    expect(shim.companyInfo.update).toHaveBeenCalledWith({
      where: { id: 'cuid-existing' },
      data: { legalName: 'Updated' },
    });
    expect(result).toEqual({ ...updated });
  });

  it('forwards explicit null to the Prisma write', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(buildRow());
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.upsertSingleton({ legalName: 'X', tradingName: null }, ADMIN_EDITOR);

    const createArg = shim.companyInfo.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArg.data).toEqual({ legalName: 'X', tradingName: null });
  });

  it('omits undefined optionals from the Prisma write', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(buildRow());
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.upsertSingleton({ legalName: 'Y' }, ADMIN_EDITOR);

    const createArg = shim.companyInfo.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArg.data).toEqual({ legalName: 'Y' });
    expect('tradingName' in createArg.data).toBe(false);
  });

  it('forwards every expanded field through toPrismaUpsertData into the upsert payload', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(
      buildRow({
        legalName: 'Co',
        companyName: 'D',
        foundedYear: 1998,
        teamSize: 5,
        industry: 'X',
        missionStatement: 'M',
        visionStatement: 'V',
        coreValues: ['A'],
        certifications: ['B'],
      }),
    );
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.upsertSingleton(
      {
        legalName: 'Co',
        companyName: 'D',
        foundedYear: 1998,
        teamSize: 5,
        industry: 'X',
        missionStatement: 'M',
        visionStatement: 'V',
        coreValues: ['A'],
        certifications: ['B'],
      },
      ADMIN_EDITOR,
    );

    const createArg = shim.companyInfo.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArg.data).toEqual({
      legalName: 'Co',
      companyName: 'D',
      foundedYear: 1998,
      teamSize: 5,
      industry: 'X',
      missionStatement: 'M',
      visionStatement: 'V',
      coreValues: ['A'],
      certifications: ['B'],
    });
  });

  it('writes a CompanyInfoVersion row inside the same transaction, with snapshot + editor', async () => {
    const shim = makePrismaShim();
    const createdRow = buildRow({
      id: 'cuid-new',
      legalName: 'Versioned',
      companyName: 'V',
      coreValues: ['A', 'B'],
    });
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(createdRow);
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow());

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.upsertSingleton(
      { legalName: 'Versioned', companyName: 'V', coreValues: ['A', 'B'] },
      ADMIN_EDITOR,
    );

    expect(shim.companyInfoVersion.create).toHaveBeenCalledTimes(1);
    const versionArg = shim.companyInfoVersion.create.mock.calls[0]?.[0] as {
      data: {
        companyInfoId: string;
        snapshot: Record<string, unknown>;
        editorUserId: string;
        editorDisplayName: string;
      };
    };

    expect(versionArg.data.companyInfoId).toBe('cuid-new');
    expect(versionArg.data.editorUserId).toBe('subject-admin');
    expect(versionArg.data.editorDisplayName).toBe('admin@example.test');
    expect(versionArg.data.snapshot.legalName).toBe('Versioned');
    expect(versionArg.data.snapshot.companyName).toBe('V');
    expect(versionArg.data.snapshot.coreValues).toEqual(['A', 'B']);
    expect(typeof versionArg.data.snapshot.createdAt).toBe('string');
    expect(typeof versionArg.data.snapshot.updatedAt).toBe('string');
  });

  it('returns the current CompanyInfo, NOT the version row', async () => {
    const shim = makePrismaShim();
    const createdRow = buildRow({ id: 'cuid-new', legalName: 'X' });
    shim.companyInfo.findFirst.mockResolvedValue(null);
    shim.companyInfo.create.mockResolvedValue(createdRow);
    shim.companyInfoVersion.create.mockResolvedValue(buildVersionRow({ id: 'v-other' }));

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.upsertSingleton({ legalName: 'X' }, ADMIN_EDITOR);

    expect(result).toEqual({ ...createdRow });
    expect((result as { id: string }).id).toBe('cuid-new');
  });

  it('propagates an update rejection', async () => {
    const shim = makePrismaShim();
    shim.companyInfo.findFirst.mockResolvedValue(buildRow());
    shim.companyInfo.update.mockRejectedValue(new Error('write conflict'));

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);

    await expect(repo.upsertSingleton({ legalName: 'Z' }, ADMIN_EDITOR)).rejects.toThrow(
      'write conflict',
    );
  });
});

describe('CompanyInfoPrismaRepository.listVersions', () => {
  it("calls findMany with newest-first ordering and take = input.take + 1 when no cursor", async () => {
    const shim = makePrismaShim();
    shim.companyInfoVersion.findMany.mockResolvedValue([]);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.listVersions({ take: 50 });

    expect(shim.companyInfoVersion.findMany).toHaveBeenCalledTimes(1);
    const arg = shim.companyInfoVersion.findMany.mock.calls[0]?.[0] as {
      orderBy: Array<Record<string, string>>;
      take: number;
      where?: unknown;
    };
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(arg.take).toBe(51);
    expect(arg.where).toBeUndefined();
  });

  it('returns { items: [], nextCursor: null } and skips findMany when cursor is unknown', async () => {
    const shim = makePrismaShim();
    shim.companyInfoVersion.findUnique.mockResolvedValue(null);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.listVersions({ take: 50, cursor: 'unknown-id' });

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(shim.companyInfoVersion.findMany).not.toHaveBeenCalled();
  });

  it('builds the OR window expression from the cursor row', async () => {
    const shim = makePrismaShim();
    const cursorCreatedAt = new Date('2026-02-15T00:00:00.000Z');
    shim.companyInfoVersion.findUnique.mockResolvedValue({
      id: 'known-id',
      createdAt: cursorCreatedAt,
    });
    shim.companyInfoVersion.findMany.mockResolvedValue([]);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    await repo.listVersions({ take: 10, cursor: 'known-id' });

    const arg = shim.companyInfoVersion.findMany.mock.calls[0]?.[0] as {
      where: {
        OR: Array<Record<string, unknown>>;
      };
    };
    expect(arg.where.OR).toEqual([
      { createdAt: { lt: cursorCreatedAt } },
      { createdAt: cursorCreatedAt, id: { lt: 'known-id' } },
    ]);
  });

  it('exposes nextCursor as oldest id of the page when findMany returns take + 1 rows', async () => {
    const shim = makePrismaShim();
    const rows = [
      buildVersionRow({ id: 'v3', createdAt: new Date('2026-03-03T00:00:00.000Z') }),
      buildVersionRow({ id: 'v2', createdAt: new Date('2026-03-02T00:00:00.000Z') }),
      buildVersionRow({ id: 'v1', createdAt: new Date('2026-03-01T00:00:00.000Z') }),
    ];
    shim.companyInfoVersion.findMany.mockResolvedValue(rows);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.listVersions({ take: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((v) => v.id)).toEqual(['v3', 'v2']);
    expect(result.nextCursor).toBe('v2');
  });

  it('exposes nextCursor as null when findMany returns ≤ take rows', async () => {
    const shim = makePrismaShim();
    shim.companyInfoVersion.findMany.mockResolvedValue([
      buildVersionRow({ id: 'v1' }),
      buildVersionRow({ id: 'v2' }),
    ]);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.listVersions({ take: 50 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });
});

describe('CompanyInfoPrismaRepository.findVersionById', () => {
  it('returns a mapped version on row hit', async () => {
    const shim = makePrismaShim();
    shim.companyInfoVersion.findUnique.mockResolvedValue(buildVersionRow({ id: 'v-known' }));

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.findVersionById('v-known');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('v-known');
    expect(shim.companyInfoVersion.findUnique).toHaveBeenCalledWith({ where: { id: 'v-known' } });
  });

  it('returns null on miss', async () => {
    const shim = makePrismaShim();
    shim.companyInfoVersion.findUnique.mockResolvedValue(null);

    const repo = new CompanyInfoPrismaRepository(shim as unknown as PrismaClient);
    const result = await repo.findVersionById('missing');

    expect(result).toBeNull();
  });
});
