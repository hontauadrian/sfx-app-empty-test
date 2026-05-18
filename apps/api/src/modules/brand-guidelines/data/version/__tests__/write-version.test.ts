import { describe, expect, it, vi } from 'vitest';
import { writeBrandGuidelinesVersion } from '../write-version';

const composedFromEmptyDb = {
  voice: null,
  visual: null,
  dosAndDonts: [],
  metadata: null,
};

function makeTxStub(opts: { brandGuidelinesVersionId: string }): {
  brandVoice: { findUnique: ReturnType<typeof vi.fn> };
  visualIdentity: { findUnique: ReturnType<typeof vi.fn> };
  dosDontsEntry: { findMany: ReturnType<typeof vi.fn> };
  brandMetadata: { findUnique: ReturnType<typeof vi.fn> };
  brandGuidelinesVersion: { create: ReturnType<typeof vi.fn> };
} {
  return {
    brandVoice: { findUnique: vi.fn().mockResolvedValue(null) },
    visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    dosDontsEntry: { findMany: vi.fn().mockResolvedValue([]) },
    brandMetadata: { findUnique: vi.fn().mockResolvedValue(null) },
    brandGuidelinesVersion: {
      create: vi.fn().mockResolvedValue({ id: opts.brandGuidelinesVersionId }),
    },
  };
}

describe('writeBrandGuidelinesVersion', () => {
  const editor = { editorUserId: 'user-1', editorDisplayName: 'Admin One' };

  it('returns the created version id', async () => {
    const tx = makeTxStub({ brandGuidelinesVersionId: 'v-new' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = await writeBrandGuidelinesVersion(tx as any, 'brand-1', editor, null);
    expect(id).toBe('v-new');
  });

  it('reads composed snapshot via tx and writes a version row', async () => {
    const tx = makeTxStub({ brandGuidelinesVersionId: 'v-x' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeBrandGuidelinesVersion(tx as any, 'brand-1', editor, 'note');
    expect(tx.brandVoice.findUnique).toHaveBeenCalledWith({ where: { brandId: 'brand-1' } });
    expect(tx.brandGuidelinesVersion.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.brandGuidelinesVersion.create.mock.calls[0]?.[0] as {
      data: {
        brandId: string;
        editorUserId: string;
        editorDisplayName: string;
        changeNote: string | null;
        snapshot: unknown;
      };
    };
    expect(createArgs.data.brandId).toBe('brand-1');
    expect(createArgs.data.editorUserId).toBe('user-1');
    expect(createArgs.data.editorDisplayName).toBe('Admin One');
    expect(createArgs.data.changeNote).toBe('note');
    expect(createArgs.data.snapshot).toEqual({
      voice: null,
      visual: null,
      dosAndDonts: [],
      metadata: null,
    });
  });

  it('threads null changeNote through to create()', async () => {
    const tx = makeTxStub({ brandGuidelinesVersionId: 'v-x' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeBrandGuidelinesVersion(tx as any, 'brand-1', editor, null);
    const createArgs = tx.brandGuidelinesVersion.create.mock.calls[0]?.[0] as {
      data: { changeNote: string | null };
    };
    expect(createArgs.data.changeNote).toBeNull();
  });

  it('uses empty composed snapshot when DB is empty', async () => {
    const tx = makeTxStub({ brandGuidelinesVersionId: 'v-x' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeBrandGuidelinesVersion(tx as any, 'brand-1', editor, null);
    const createArgs = tx.brandGuidelinesVersion.create.mock.calls[0]?.[0] as {
      data: { snapshot: unknown };
    };
    expect(createArgs.data.snapshot).toEqual(composedFromEmptyDb);
  });
});
