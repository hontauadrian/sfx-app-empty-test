import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { PrismaClient } from '@sfx/database';
import { BrandMetadataPrismaRepository } from '../brand-metadata.repository';

interface DelegateMock {
  findUnique: Mock;
  upsert: Mock;
}

interface PrismaMock {
  brandMetadata: DelegateMock;
  $transaction: Mock;
}

function makePrismaMock(): {
  prisma: PrismaMock;
  versionCreate: Mock;
} {
  const delegate: DelegateMock = { findUnique: vi.fn(), upsert: vi.fn() };
  const versionCreate = vi.fn().mockResolvedValue({ id: 'v-1' });
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      brandMetadata: delegate,
      brandVoice: { findUnique: vi.fn().mockResolvedValue(null) },
      visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
      dosDontsEntry: { findMany: vi.fn().mockResolvedValue([]) },
      brandGuidelinesVersion: { create: versionCreate },
    }),
  );
  return {
    prisma: { brandMetadata: delegate, $transaction },
    versionCreate,
  };
}

interface MetadataRow {
  brandId: string;
  ownerUserId: string;
  lastUpdatedAt: Date;
  lastUpdatedByUserId: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

function makeRow(overrides: Partial<MetadataRow> = {}): MetadataRow {
  return {
    brandId: 'b1',
    ownerUserId: 'subject-owner',
    lastUpdatedAt: new Date('2026-05-17T00:00:00.000Z'),
    lastUpdatedByUserId: 'subject-admin',
    tags: [] as string[],
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    ...overrides,
  };
}

describe('BrandMetadataPrismaRepository', () => {
  let prisma: PrismaMock;
  let versionCreate: Mock;
  let repo: BrandMetadataPrismaRepository;

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    versionCreate = m.versionCreate;
    repo = new BrandMetadataPrismaRepository(prisma as unknown as PrismaClient);
  });

  describe('findByBrandId', () => {
    it('returns mapped metadata when row exists', async () => {
      prisma.brandMetadata.findUnique.mockResolvedValue(makeRow({ tags: ['en'] }));
      const found = await repo.findByBrandId('b1');
      expect(found?.tags).toEqual(['en']);
    });

    it('returns null when missing', async () => {
      prisma.brandMetadata.findUnique.mockResolvedValue(null);
      expect(await repo.findByBrandId('b1')).toBeNull();
    });
  });

  describe('upsertByBrandId', () => {
    it('creates with default empty tags + writes a version row', async () => {
      prisma.brandMetadata.upsert.mockResolvedValue(makeRow());
      await repo.upsertByBrandId(
        'b1',
        {},
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        null,
      );
      const call = prisma.brandMetadata.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(call.create).toMatchObject({
        brandId: 'b1',
        ownerUserId: 'subject-owner',
        lastUpdatedByUserId: 'subject-admin',
        tags: [],
      });
      expect(versionCreate).toHaveBeenCalledOnce();
      const versionArgs = versionCreate.mock.calls[0]?.[0] as {
        data: { changeNote: string | null };
      };
      expect(versionArgs.data.changeNote).toBeNull();
    });

    it('passes tags when provided (including empty array as explicit clear)', async () => {
      prisma.brandMetadata.upsert.mockResolvedValue(makeRow({ tags: [] }));
      await repo.upsertByBrandId(
        'b1',
        { tags: [] },
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        null,
      );
      const call = prisma.brandMetadata.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(call.update).toMatchObject({ tags: [] });
      expect(call.create).toMatchObject({ tags: [] });
    });

    it('threads changeNote into the version write', async () => {
      prisma.brandMetadata.upsert.mockResolvedValue(makeRow());
      await repo.upsertByBrandId(
        'b1',
        { tags: ['x'] },
        { editorUserId: 'subject-admin', ownerUserId: 'subject-owner' },
        'metadata tweak',
      );
      const versionArgs = versionCreate.mock.calls[0]?.[0] as {
        data: { changeNote: string | null };
      };
      expect(versionArgs.data.changeNote).toBe('metadata tweak');
    });

    it('rewrites lastUpdatedAt + lastUpdatedByUserId on every upsert', async () => {
      prisma.brandMetadata.upsert.mockResolvedValue(makeRow({ tags: ['x'] }));
      await repo.upsertByBrandId(
        'b1',
        { tags: ['x'] },
        { editorUserId: 'subject-admin-2', ownerUserId: 'subject-owner' },
        null,
      );
      const call = prisma.brandMetadata.upsert.mock.calls[0]?.[0] as {
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      };
      expect(call.update.lastUpdatedByUserId).toBe('subject-admin-2');
      expect(call.update.lastUpdatedAt).toBeInstanceOf(Date);
      expect(call.create.lastUpdatedByUserId).toBe('subject-admin-2');
    });
  });
});
