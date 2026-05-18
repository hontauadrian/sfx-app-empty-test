import type { PrismaClient } from '@sfx/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandVoicePrismaRepository } from '../brand-voice.repository';

function makeTxClient(opts: {
  upsertRow: Record<string, unknown>;
  versionCreateId?: string;
}): {
  voiceUpsert: ReturnType<typeof vi.fn>;
  versionCreate: ReturnType<typeof vi.fn>;
  tx: Record<string, unknown>;
} {
  const voiceUpsert = vi.fn().mockResolvedValue(opts.upsertRow);
  const versionCreate = vi.fn().mockResolvedValue({ id: opts.versionCreateId ?? 'v-new' });
  return {
    voiceUpsert,
    versionCreate,
    tx: {
      brandVoice: { upsert: voiceUpsert, findUnique: vi.fn().mockResolvedValue(opts.upsertRow) },
      visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
      dosDontsEntry: { findMany: vi.fn().mockResolvedValue([]) },
      brandMetadata: { findUnique: vi.fn().mockResolvedValue(null) },
      brandGuidelinesVersion: { create: versionCreate },
    },
  };
}

function makePrismaStub(opts: {
  upsertRow?: Record<string, unknown>;
  findUniqueResult?: unknown;
} = {}): {
  findUnique: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
  getTxContext: () => ReturnType<typeof makeTxClient>;
  prisma: PrismaClient;
} {
  const findUnique = vi.fn().mockResolvedValue(opts.findUniqueResult ?? null);
  let txContext: ReturnType<typeof makeTxClient> | null = null;
  const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) => {
    txContext = makeTxClient({ upsertRow: opts.upsertRow ?? {} });
    return cb(txContext.tx);
  });
  return {
    findUnique,
    $transaction,
    getTxContext: (): ReturnType<typeof makeTxClient> => {
      if (!txContext) throw new Error('tx not entered');
      return txContext;
    },
    prisma: {
      brandVoice: { findUnique },
      $transaction,
    } as unknown as PrismaClient,
  };
}

const editor = { editorUserId: 'subject-admin', editorDisplayName: 'admin@example.test' };

const sampleRow = {
  brandId: 'clxbrand0001',
  tone: 'Bold',
  preferredVocabulary: ['craft'],
  restrictedVocabulary: [],
  messagingPillars: [],
  writingStyleRules: '',
  audienceRules: [],
  approvedExamples: [],
  rejectedExamples: [],
  createdAt: new Date('2026-05-17'),
  updatedAt: new Date('2026-05-17'),
};

describe('BrandVoicePrismaRepository.findByBrandId', () => {
  it('returns the mapped entity when a row exists', async () => {
    const stub = makePrismaStub({ findUniqueResult: sampleRow });
    const repo = new BrandVoicePrismaRepository(stub.prisma);
    const voice = await repo.findByBrandId('clxbrand0001');
    expect(voice?.tone).toBe('Bold');
    expect(stub.findUnique).toHaveBeenCalledWith({ where: { brandId: 'clxbrand0001' } });
  });

  it('returns null when no row exists', async () => {
    const stub = makePrismaStub({ findUniqueResult: null });
    const repo = new BrandVoicePrismaRepository(stub.prisma);
    expect(await repo.findByBrandId('missing')).toBeNull();
  });
});

describe('BrandVoicePrismaRepository.upsertForBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts within a transaction and writes a version row', async () => {
    const stub = makePrismaStub({ upsertRow: sampleRow });
    const repo = new BrandVoicePrismaRepository(stub.prisma);
    const result = await repo.upsertForBrand(
      'clxbrand0001',
      { tone: 'Bold', preferredVocabulary: ['craft'] },
      editor,
      null,
    );
    expect(result.tone).toBe('Bold');
    expect(stub.$transaction).toHaveBeenCalledOnce();
    const tx = stub.getTxContext();
    expect(tx.voiceUpsert).toHaveBeenCalledOnce();
    expect(tx.versionCreate).toHaveBeenCalledOnce();
    const versionArgs = tx.versionCreate.mock.calls[0]?.[0] as { data: { changeNote: string | null } };
    expect(versionArgs.data.changeNote).toBeNull();
  });

  it('threads changeNote into the version write', async () => {
    const stub = makePrismaStub({ upsertRow: sampleRow });
    const repo = new BrandVoicePrismaRepository(stub.prisma);
    await repo.upsertForBrand('clxbrand0001', { tone: 'Bold' }, editor, 'tone tighten');
    const tx = stub.getTxContext();
    const versionArgs = tx.versionCreate.mock.calls[0]?.[0] as {
      data: { changeNote: string | null };
    };
    expect(versionArgs.data.changeNote).toBe('tone tighten');
  });
});
