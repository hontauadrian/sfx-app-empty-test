import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { PrismaClient } from '@sfx/database';
import { DosDontsPrismaRepository } from '../dos-and-donts.repository';

interface DelegateMock {
  findMany: Mock;
  findFirst: Mock;
  create: Mock;
  update: Mock;
  delete: Mock;
}

interface PrismaMock {
  dosDontsEntry: DelegateMock;
  $transaction: Mock;
}

function makePrismaMock(): { prisma: PrismaMock; versionCreate: Mock } {
  const delegate: DelegateMock = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const versionCreate = vi.fn().mockResolvedValue({ id: 'v-1' });
  const mock: PrismaMock = {
    dosDontsEntry: delegate,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        dosDontsEntry: { ...delegate, findMany: vi.fn().mockResolvedValue([]) },
        brandVoice: { findUnique: vi.fn().mockResolvedValue(null) },
        visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
        brandMetadata: { findUnique: vi.fn().mockResolvedValue(null) },
        brandGuidelinesVersion: { create: versionCreate },
      }),
    ),
  };
  return { prisma: mock, versionCreate };
}

interface DosDontsRowShape {
  id: string;
  brandId: string;
  type: string;
  category: string;
  ruleText: string;
  exampleText: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeRow(overrides: Partial<DosDontsRowShape> = {}): DosDontsRowShape {
  return {
    id: 'dd1',
    brandId: 'b1',
    type: 'do',
    category: 'tone',
    ruleText: 'rule',
    exampleText: null as string | null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    ...overrides,
  };
}

const editor = { editorUserId: 'subject-admin', editorDisplayName: 'admin@example.test' };

describe('DosDontsPrismaRepository', () => {
  let prisma: PrismaMock;
  let versionCreate: Mock;
  let repo: DosDontsPrismaRepository;

  beforeEach(() => {
    const m = makePrismaMock();
    prisma = m.prisma;
    versionCreate = m.versionCreate;
    repo = new DosDontsPrismaRepository(prisma as unknown as PrismaClient);
  });

  describe('listByBrand', () => {
    it('returns entries newest-first with no filters', async () => {
      prisma.dosDontsEntry.findMany.mockResolvedValue([makeRow()]);
      const result = await repo.listByBrand('b1', {});
      expect(result).toHaveLength(1);
      expect(prisma.dosDontsEntry.findMany).toHaveBeenCalledWith({
        where: { brandId: 'b1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('narrows by type', async () => {
      prisma.dosDontsEntry.findMany.mockResolvedValue([]);
      await repo.listByBrand('b1', { type: 'dont' });
      expect(prisma.dosDontsEntry.findMany).toHaveBeenCalledWith({
        where: { brandId: 'b1', type: 'dont' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('narrows by category', async () => {
      prisma.dosDontsEntry.findMany.mockResolvedValue([]);
      await repo.listByBrand('b1', { category: 'legal' });
      expect(prisma.dosDontsEntry.findMany).toHaveBeenCalledWith({
        where: { brandId: 'b1', category: 'legal' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('combines both filters', async () => {
      prisma.dosDontsEntry.findMany.mockResolvedValue([]);
      await repo.listByBrand('b1', { type: 'do', category: 'tone' });
      expect(prisma.dosDontsEntry.findMany).toHaveBeenCalledWith({
        where: { brandId: 'b1', type: 'do', category: 'tone' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });
  });

  describe('findByIdInBrand', () => {
    it('returns mapped entry when present', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(makeRow());
      const found = await repo.findByIdInBrand('b1', 'dd1');
      expect(found?.id).toBe('dd1');
    });

    it('returns null when missing', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(null);
      expect(await repo.findByIdInBrand('b1', 'dd1')).toBeNull();
    });
  });

  describe('createInBrand', () => {
    it('wraps create in a transaction, persists fields, writes version', async () => {
      prisma.dosDontsEntry.create.mockResolvedValue(makeRow({ id: 'dd2', ruleText: 'r2' }));
      const result = await repo.createInBrand(
        'b1',
        { type: 'do', category: 'tone', ruleText: 'r2' },
        editor,
        null,
      );
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(prisma.dosDontsEntry.create).toHaveBeenCalledWith({
        data: { brandId: 'b1', type: 'do', category: 'tone', ruleText: 'r2', exampleText: null },
      });
      expect(versionCreate).toHaveBeenCalledOnce();
      expect(result.id).toBe('dd2');
    });

    it('preserves a provided exampleText and threads changeNote', async () => {
      prisma.dosDontsEntry.create.mockResolvedValue(makeRow({ exampleText: 'ex' }));
      await repo.createInBrand(
        'b1',
        { type: 'do', category: 'tone', ruleText: 'r', exampleText: 'ex' },
        editor,
        'note-on-create',
      );
      expect(prisma.dosDontsEntry.create).toHaveBeenCalledWith({
        data: { brandId: 'b1', type: 'do', category: 'tone', ruleText: 'r', exampleText: 'ex' },
      });
      const versionArgs = versionCreate.mock.calls[0]?.[0] as {
        data: { changeNote: string | null };
      };
      expect(versionArgs.data.changeNote).toBe('note-on-create');
    });
  });

  describe('updateInBrandById', () => {
    it('returns null when missing (no version write)', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(null);
      expect(
        await repo.updateInBrandById('b1', 'dd1', {}, editor, null),
      ).toBeNull();
      expect(prisma.dosDontsEntry.update).not.toHaveBeenCalled();
      expect(versionCreate).not.toHaveBeenCalled();
    });

    it('updates only provided fields and writes version', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(makeRow());
      prisma.dosDontsEntry.update.mockResolvedValue(makeRow({ ruleText: 'New' }));
      const result = await repo.updateInBrandById(
        'b1',
        'dd1',
        { ruleText: 'New' },
        editor,
        null,
      );
      expect(prisma.dosDontsEntry.update).toHaveBeenCalledWith({
        where: { id: 'dd1' },
        data: { ruleText: 'New' },
      });
      expect(result?.ruleText).toBe('New');
      expect(versionCreate).toHaveBeenCalledOnce();
    });

    it('passes exampleText: null through', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(makeRow());
      prisma.dosDontsEntry.update.mockResolvedValue(makeRow({ exampleText: null }));
      await repo.updateInBrandById('b1', 'dd1', { exampleText: null }, editor, null);
      expect(prisma.dosDontsEntry.update).toHaveBeenCalledWith({
        where: { id: 'dd1' },
        data: { exampleText: null },
      });
    });
  });

  describe('deleteInBrandById', () => {
    it('returns false when missing (no version write)', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(null);
      expect(await repo.deleteInBrandById('b1', 'dd1', editor, null)).toBe(false);
      expect(prisma.dosDontsEntry.delete).not.toHaveBeenCalled();
      expect(versionCreate).not.toHaveBeenCalled();
    });

    it('returns true and deletes when present, writes version', async () => {
      prisma.dosDontsEntry.findFirst.mockResolvedValue(makeRow());
      prisma.dosDontsEntry.delete.mockResolvedValue(makeRow());
      expect(await repo.deleteInBrandById('b1', 'dd1', editor, 'delete note')).toBe(true);
      expect(prisma.dosDontsEntry.delete).toHaveBeenCalledWith({ where: { id: 'dd1' } });
      const versionArgs = versionCreate.mock.calls[0]?.[0] as {
        data: { changeNote: string | null };
      };
      expect(versionArgs.data.changeNote).toBe('delete note');
    });
  });
});
