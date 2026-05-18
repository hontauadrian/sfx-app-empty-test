import { describe, expect, it, vi } from 'vitest';
import { composeSnapshotInTx } from '../snapshot-composer';

function makeTxStub(state: {
  voice?: unknown;
  visual?: unknown;
  dos?: unknown[];
  metadata?: unknown;
}): {
  brandVoice: { findUnique: ReturnType<typeof vi.fn> };
  visualIdentity: { findUnique: ReturnType<typeof vi.fn> };
  dosDontsEntry: { findMany: ReturnType<typeof vi.fn> };
  brandMetadata: { findUnique: ReturnType<typeof vi.fn> };
} {
  return {
    brandVoice: { findUnique: vi.fn().mockResolvedValue(state.voice ?? null) },
    visualIdentity: { findUnique: vi.fn().mockResolvedValue(state.visual ?? null) },
    dosDontsEntry: { findMany: vi.fn().mockResolvedValue(state.dos ?? []) },
    brandMetadata: { findUnique: vi.fn().mockResolvedValue(state.metadata ?? null) },
  };
}

const dosRow = {
  id: 'dd-1',
  brandId: 'brand-1',
  type: 'do',
  category: 'tone',
  ruleText: 'Be concise',
  exampleText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const voiceRow = {
  brandId: 'brand-1',
  tone: 'Bold',
  preferredVocabulary: [],
  restrictedVocabulary: [],
  messagingPillars: [],
  writingStyleRules: '',
  audienceRules: [],
  approvedExamples: [],
  rejectedExamples: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const visualRow = {
  brandId: 'brand-1',
  logoUsage: 'Default',
  colorPalette: [],
  typography: [],
  spacingGuidance: '',
  imageStyleGuidance: '',
  iconographyGuidance: '',
  usageRestrictions: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const metadataRow = {
  brandId: 'brand-1',
  ownerUserId: 'u-1',
  lastUpdatedAt: new Date(),
  lastUpdatedByUserId: 'u-1',
  tags: ['x'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('composeSnapshotInTx', () => {
  it('returns a snapshot with all sub-resources null when DB is empty', async () => {
    const tx = makeTxStub({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.voice).toBeNull();
    expect(snapshot.visual).toBeNull();
    expect(snapshot.dosAndDonts).toEqual([]);
    expect(snapshot.metadata).toBeNull();
  });

  it('populates voice when row exists', async () => {
    const tx = makeTxStub({ voice: voiceRow });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.voice?.tone).toBe('Bold');
  });

  it('populates visual when row exists', async () => {
    const tx = makeTxStub({ visual: visualRow });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.visual?.logoUsage).toBe('Default');
  });

  it('populates metadata when row exists', async () => {
    const tx = makeTxStub({ metadata: metadataRow });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.metadata?.tags).toEqual(['x']);
  });

  it('preserves dos-and-donts ordering (passes through tx findMany result)', async () => {
    const tx = makeTxStub({
      dos: [
        { ...dosRow, id: 'dd-2' },
        { ...dosRow, id: 'dd-1' },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.dosAndDonts.map((e) => e.id)).toEqual(['dd-2', 'dd-1']);
    expect(tx.dosDontsEntry.findMany).toHaveBeenCalledWith({
      where: { brandId: 'brand-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('populates all four sections when every sub-resource exists', async () => {
    const tx = makeTxStub({
      voice: voiceRow,
      visual: visualRow,
      dos: [dosRow],
      metadata: metadataRow,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await composeSnapshotInTx(tx as any, 'brand-1');
    expect(snapshot.voice).not.toBeNull();
    expect(snapshot.visual).not.toBeNull();
    expect(snapshot.dosAndDonts).toHaveLength(1);
    expect(snapshot.metadata).not.toBeNull();
  });
});
