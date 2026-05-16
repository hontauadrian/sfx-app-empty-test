import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BrandProfile,
  IBrandProfileRepository,
  IVisualIdentityRepository,
  VisualIdentity,
  VisualIdentityWritePayload,
} from '@sfx/domain';
import { VisualIdentityController } from '../visual-identity.controller';
import type { AuthenticatedRequest } from '../../../../auth/application/types/authenticated-request';

function buildBrand(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    id: 'brand-1',
    ownerSubject: 'sub-1',
    name: 'Acme',
    description: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T05:00:00.000Z'),
    ...overrides,
  };
}

function buildIdentity(overrides: Partial<VisualIdentity> = {}): VisualIdentity {
  return {
    id: 'vi-1',
    brandId: 'brand-1',
    logoUsageRules: 'rules',
    colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'note' }],
    typographyRules: [
      { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
    ],
    spacingLayoutGuidance: '8px',
    imageStyleGuidance: null,
    iconographyGuidance: null,
    usageRestrictions: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    ...overrides,
  };
}

function buildRequest(subject = 'sub-1'): AuthenticatedRequest {
  return { user: { subject, email: 'a@b.co', roles: ['viewer'] } } as AuthenticatedRequest;
}

interface BrandRepoMock extends IBrandProfileRepository {
  findById: ReturnType<typeof vi.fn>;
  listByOwner: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface VisualIdentityRepoMock extends IVisualIdentityRepository {
  findByBrand: ReturnType<typeof vi.fn>;
  upsertForBrand: ReturnType<typeof vi.fn>;
}

function buildBrandRepoMock(): BrandRepoMock {
  return {
    findById: vi.fn(),
    listByOwner: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as BrandRepoMock;
}

function buildIdentityRepoMock(): VisualIdentityRepoMock {
  return {
    findByBrand: vi.fn(),
    upsertForBrand: vi.fn(),
  } as VisualIdentityRepoMock;
}

describe('VisualIdentityController', () => {
  let brandRepo: BrandRepoMock;
  let identityRepo: VisualIdentityRepoMock;
  let controller: VisualIdentityController;

  beforeEach(() => {
    brandRepo = buildBrandRepoMock();
    identityRepo = buildIdentityRepoMock();
    controller = new VisualIdentityController(brandRepo, identityRepo);
  });

  describe('getVisualIdentity', () => {
    it('returns empty-state envelope when no row exists yet', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      identityRepo.findByBrand.mockResolvedValueOnce(null);

      const result = await controller.getVisualIdentity(buildRequest(), 'brand-1');

      expect(brandRepo.findById).toHaveBeenCalledWith('brand-1', 'sub-1');
      expect(identityRepo.findByBrand).toHaveBeenCalledWith('brand-1', 'sub-1');
      expect(result.id).toBe('');
      expect(result.brandId).toBe('brand-1');
      expect(result.logoUsageRules).toBeNull();
      expect(result.colourPalette).toEqual([]);
      expect(result.typographyRules).toEqual([]);
      expect(result.createdAt).toBe('2026-05-15T05:00:00.000Z');
    });

    it('returns the persisted shape when a row exists', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      identityRepo.findByBrand.mockResolvedValueOnce(buildIdentity());

      const result = await controller.getVisualIdentity(buildRequest(), 'brand-1');

      expect(result.id).toBe('vi-1');
      expect(result.colourPalette).toHaveLength(1);
      expect(result.typographyRules[0]?.weight).toBe('700');
      expect(result.createdAt).toBe('2026-05-15T00:00:00.000Z');
    });

    it('throws 404 when the brand is missing or cross-tenant', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);

      await expect(
        controller.getVisualIdentity(buildRequest('sub-other'), 'brand-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(identityRepo.findByBrand).not.toHaveBeenCalled();
    });
  });

  describe('upsertVisualIdentity', () => {
    it('upserts a populated body and returns the mapped DTO', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      identityRepo.upsertForBrand.mockResolvedValueOnce(buildIdentity());

      const result = await controller.upsertVisualIdentity(
        buildRequest(),
        'brand-1',
        {
          logoUsageRules: 'rules',
          colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'note' }],
          typographyRules: [
            { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
          ],
          spacingLayoutGuidance: '8px',
          imageStyleGuidance: null,
          iconographyGuidance: null,
          usageRestrictions: null,
        },
      );

      const payload = identityRepo.upsertForBrand.mock.calls[0]?.[2] as VisualIdentityWritePayload;
      expect(payload.logoUsageRules).toBe('rules');
      expect(payload.colourPalette).toHaveLength(1);
      expect(payload.typographyRules[0]?.role).toBe('Display');
      expect(result.colourPalette[0]?.name).toBe('Primary');
    });

    it('throws 404 when the brand is missing before delegating', async () => {
      brandRepo.findById.mockResolvedValueOnce(null);
      await expect(
        controller.upsertVisualIdentity(buildRequest('sub-other'), 'brand-1', {
          logoUsageRules: null,
          colourPalette: [],
          typographyRules: [],
          spacingLayoutGuidance: null,
          imageStyleGuidance: null,
          iconographyGuidance: null,
          usageRestrictions: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(identityRepo.upsertForBrand).not.toHaveBeenCalled();
    });

    it('throws 404 when the repository returns null after the brand pre-check (race)', async () => {
      brandRepo.findById.mockResolvedValueOnce(buildBrand());
      identityRepo.upsertForBrand.mockResolvedValueOnce(null);
      await expect(
        controller.upsertVisualIdentity(buildRequest(), 'brand-1', {
          logoUsageRules: null,
          colourPalette: [],
          typographyRules: [],
          spacingLayoutGuidance: null,
          imageStyleGuidance: null,
          iconographyGuidance: null,
          usageRestrictions: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
