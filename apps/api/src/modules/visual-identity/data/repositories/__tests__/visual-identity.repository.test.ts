import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { BrandProfile, IBrandProfileRepository } from '@sfx/domain';
import { VisualIdentityRepository } from '../visual-identity.repository';

interface PrismaStub {
  visualIdentity: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}

function makeBrandRepo(found: boolean): IBrandProfileRepository {
  return {
    async listByOwner(): Promise<BrandProfile[]> {
      return [];
    },
    async findById(): Promise<BrandProfile | null> {
      return found
        ? {
            id: 'brand-1',
            ownerSubject: 'admin',
            name: 'Brand',
            description: null,
            createdAt: new Date('2026-05-15T00:00:00.000Z'),
            updatedAt: new Date('2026-05-15T00:00:00.000Z'),
          }
        : null;
    },
    async create(): Promise<BrandProfile> {
      throw new Error('not implemented');
    },
    async update(): Promise<BrandProfile | null> {
      return null;
    },
    async delete(): Promise<boolean> {
      return false;
    },
  };
}

function makePrisma(rowOnUpsert: unknown, rowOnFind: unknown = null): PrismaStub {
  return {
    visualIdentity: {
      findUnique: vi.fn().mockResolvedValue(rowOnFind),
      upsert: vi.fn().mockResolvedValue(rowOnUpsert),
    },
  };
}

const NOW = new Date('2026-05-15T00:00:00.000Z');

describe('VisualIdentityRepository', () => {
  it('findByBrand returns null when the brand is not owned by the caller', async () => {
    const prisma = makePrisma({});
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(false),
    );
    const result = await repo.findByBrand('brand-1', 'admin');
    expect(result).toBeNull();
    expect(prisma.visualIdentity.findUnique).not.toHaveBeenCalled();
  });

  it('findByBrand returns null when the row does not exist yet', async () => {
    const prisma = makePrisma({});
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(true),
    );
    const result = await repo.findByBrand('brand-1', 'admin');
    expect(result).toBeNull();
    expect(prisma.visualIdentity.findUnique).toHaveBeenCalledWith({
      where: { brandId: 'brand-1' },
    });
  });

  it('findByBrand returns the mapped row when present', async () => {
    const prisma = makePrisma({}, {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'rules',
      colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'note' }],
      typographyRules: [
        { role: 'Display', family: 'Inter', weight: '700', size: null, notes: null },
      ],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(true),
    );
    const result = await repo.findByBrand('brand-1', 'admin');
    expect(result?.brandId).toBe('brand-1');
    expect(result?.colourPalette).toHaveLength(1);
    expect(result?.typographyRules[0]?.weight).toBe('700');
  });

  it('upsertForBrand returns null when the brand is not owned', async () => {
    const prisma = makePrisma({});
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(false),
    );
    const payload = {
      logoUsageRules: 'rules',
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    };
    const result = await repo.upsertForBrand('brand-1', 'admin', payload);
    expect(result).toBeNull();
    expect(prisma.visualIdentity.upsert).not.toHaveBeenCalled();
  });

  it('upsertForBrand passes shape-correct args to Prisma and maps the returned row', async () => {
    const upsertRow = {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: 'rules',
      colourPalette: [{ name: 'Primary', hex: 'xxx', usage: null }],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const prisma = makePrisma(upsertRow);
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(true),
    );
    const payload = {
      logoUsageRules: 'rules',
      colourPalette: [{ name: 'Primary', hex: 'xxx', usage: null }],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    };
    const result = await repo.upsertForBrand('brand-1', 'admin', payload);
    expect(result?.id).toBe('vi-1');
    const call = prisma.visualIdentity.upsert.mock.calls[0]?.[0] as
      | { where: unknown; create: unknown; update: unknown }
      | undefined;
    expect(call?.where).toEqual({ brandId: 'brand-1' });
    expect(call?.create).toMatchObject({ brandId: 'brand-1', logoUsageRules: 'rules' });
    expect(call?.update).toMatchObject({ logoUsageRules: 'rules' });
  });

  it('mappers skip malformed json array entries', async () => {
    const upsertRow = {
      id: 'vi-1',
      brandId: 'brand-1',
      logoUsageRules: null,
      colourPalette: [null, 'oops', { name: 'OK', hex: 'xxx' }, { hex: 'xxx' }],
      typographyRules: [
        null,
        { role: 'D' },
        { role: 'Display', family: 'Inter', weight: 12, size: null, notes: undefined },
      ],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const prisma = makePrisma(upsertRow);
    const repo = new VisualIdentityRepository(
      prisma as never,
      makeBrandRepo(true),
    );
    const result = await repo.upsertForBrand('brand-1', 'admin', {
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    });
    expect(result?.colourPalette).toHaveLength(1);
    expect(result?.typographyRules[0]?.weight).toBeNull();
  });
});
