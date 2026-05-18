import type { PrismaClient } from '@sfx/database';
import { describe, expect, it, vi } from 'vitest';
import { VisualIdentityPrismaRepository } from '../visual-identity.repository';

const sampleRow = {
  brandId: 'clxbrand0001',
  logoUsage: 'Default',
  colorPalette: [],
  typography: [],
  spacingGuidance: '',
  imageStyleGuidance: '',
  iconographyGuidance: '',
  usageRestrictions: '',
  createdAt: new Date('2026-05-17'),
  updatedAt: new Date('2026-05-17'),
};

function makeTxClient(): {
  upsert: ReturnType<typeof vi.fn>;
  versionCreate: ReturnType<typeof vi.fn>;
  tx: Record<string, unknown>;
} {
  const upsert = vi.fn().mockResolvedValue(sampleRow);
  const versionCreate = vi.fn().mockResolvedValue({ id: 'v-1' });
  return {
    upsert,
    versionCreate,
    tx: {
      visualIdentity: { upsert, findUnique: vi.fn().mockResolvedValue(sampleRow) },
      brandVoice: { findUnique: vi.fn().mockResolvedValue(null) },
      dosDontsEntry: { findMany: vi.fn().mockResolvedValue([]) },
      brandMetadata: { findUnique: vi.fn().mockResolvedValue(null) },
      brandGuidelinesVersion: { create: versionCreate },
    },
  };
}

function makePrismaStub(opts: { findUniqueResult?: unknown } = {}): {
  findUnique: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
  getTxContext: () => ReturnType<typeof makeTxClient>;
  prisma: PrismaClient;
} {
  const findUnique = vi.fn().mockResolvedValue(opts.findUniqueResult ?? null);
  let txCtx: ReturnType<typeof makeTxClient> | null = null;
  const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
    txCtx = makeTxClient();
    return cb(txCtx.tx);
  });
  return {
    findUnique,
    $transaction,
    getTxContext: (): ReturnType<typeof makeTxClient> => {
      if (!txCtx) throw new Error('tx not entered');
      return txCtx;
    },
    prisma: {
      visualIdentity: { findUnique },
      $transaction,
    } as unknown as PrismaClient,
  };
}

const editor = { editorUserId: 'subject-admin', editorDisplayName: 'admin@example.test' };

describe('VisualIdentityPrismaRepository.findByBrandId', () => {
  it('returns the mapped entity when a row exists', async () => {
    const stub = makePrismaStub({ findUniqueResult: sampleRow });
    const repo = new VisualIdentityPrismaRepository(stub.prisma);
    const value = await repo.findByBrandId('clxbrand0001');
    expect(value?.logoUsage).toBe('Default');
  });

  it('returns null when no row exists', async () => {
    const stub = makePrismaStub({ findUniqueResult: null });
    const repo = new VisualIdentityPrismaRepository(stub.prisma);
    expect(await repo.findByBrandId('missing')).toBeNull();
  });
});

describe('VisualIdentityPrismaRepository.upsertForBrand', () => {
  it('upserts within $transaction and writes a version row', async () => {
    const stub = makePrismaStub();
    const repo = new VisualIdentityPrismaRepository(stub.prisma);
    const result = await repo.upsertForBrand(
      'clxbrand0001',
      { logoUsage: 'Default' },
      editor,
      null,
    );
    expect(result.logoUsage).toBe('Default');
    expect(stub.$transaction).toHaveBeenCalledOnce();
    const tx = stub.getTxContext();
    expect(tx.upsert).toHaveBeenCalledOnce();
    expect(tx.versionCreate).toHaveBeenCalledOnce();
    const versionArgs = tx.versionCreate.mock.calls[0]?.[0] as {
      data: { changeNote: string | null };
    };
    expect(versionArgs.data.changeNote).toBeNull();
  });

  it('threads changeNote into the version write', async () => {
    const stub = makePrismaStub();
    const repo = new VisualIdentityPrismaRepository(stub.prisma);
    await repo.upsertForBrand('clxbrand0001', { logoUsage: 'Default' }, editor, 'logo update');
    const tx = stub.getTxContext();
    const versionArgs = tx.versionCreate.mock.calls[0]?.[0] as {
      data: { changeNote: string | null };
    };
    expect(versionArgs.data.changeNote).toBe('logo update');
  });
});
