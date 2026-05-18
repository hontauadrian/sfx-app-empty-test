import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  Brand,
  BrandGuidelinesVersionRepository,
  BrandRepository,
  VisualIdentity,
  VisualIdentityRepository,
} from '@sfx/domain';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualIdentityController } from '../visual-identity.controller';
import type { RequestWithAuthenticatedUser } from '../../../../../common/guards/jwt-auth.guard';

type BrandRepoMock = {
  listActive: Mock;
  findActiveById: Mock;
  create: Mock;
  renameById: Mock;
  softDeleteById: Mock;
};

type VisualRepoMock = {
  findByBrandId: Mock;
  upsertForBrand: Mock;
};

type VersionRepoMock = {
  list: Mock;
  findById: Mock;
  findLatestForBrand: Mock;
};

function makeBrand(): Brand {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    deletedAt: null,
  };
}

function makeVisual(over: Partial<VisualIdentity> = {}): VisualIdentity {
  return {
    brandId: 'clxbrand0001',
    logoUsage: 'Default',
    colorPalette: [],
    typography: [],
    spacingGuidance: '',
    imageStyleGuidance: '',
    iconographyGuidance: '',
    usageRestrictions: '',
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    ...over,
  };
}

const adminReq = {
  user: { subject: 'subject-admin', email: 'admin@example.test', roles: ['admin'] },
} as unknown as RequestWithAuthenticatedUser;

const expectedEditor = {
  editorUserId: 'subject-admin',
  editorDisplayName: 'admin@example.test',
};

describe('VisualIdentityController', () => {
  let brandRepo: BrandRepoMock;
  let visualRepo: VisualRepoMock;
  let versionRepo: VersionRepoMock;
  let controller: VisualIdentityController;

  beforeEach(() => {
    brandRepo = {
      listActive: vi.fn(),
      findActiveById: vi.fn(),
      create: vi.fn(),
      renameById: vi.fn(),
      softDeleteById: vi.fn(),
    };
    visualRepo = { findByBrandId: vi.fn(), upsertForBrand: vi.fn() };
    versionRepo = {
      list: vi.fn(),
      findById: vi.fn(),
      findLatestForBrand: vi.fn().mockResolvedValue(null),
    };
    controller = new VisualIdentityController(
      brandRepo as unknown as BrandRepository,
      visualRepo as unknown as VisualIdentityRepository,
      versionRepo as unknown as BrandGuidelinesVersionRepository,
    );
  });

  describe('getVisual', () => {
    it('returns the persisted visual + latestVersionId null when no version exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      visualRepo.findByBrandId.mockResolvedValue(makeVisual({ logoUsage: 'Mono' }));
      const result = await controller.getVisual('clxbrand0001');
      expect(result?.logoUsage).toBe('Mono');
      expect(result?.latestVersionId).toBeNull();
    });

    it('returns latestVersionId when version exists', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      visualRepo.findByBrandId.mockResolvedValue(makeVisual());
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.getVisual('clxbrand0001');
      expect(result?.latestVersionId).toBe('v-1');
    });

    it('returns null when no visual identity exists for the brand', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      visualRepo.findByBrandId.mockResolvedValue(null);
      expect(await controller.getVisual('clxbrand0001')).toBeNull();
    });

    it('throws NotFoundException when brand is missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(controller.getVisual('absent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('putVisual', () => {
    it('upserts with null changeNote and returns latestVersionId', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      visualRepo.upsertForBrand.mockResolvedValue(makeVisual({ logoUsage: 'Default' }));
      versionRepo.findLatestForBrand.mockResolvedValue({ id: 'v-1' });
      const result = await controller.putVisual(
        'clxbrand0001',
        { logoUsage: 'Default' },
        {},
        adminReq,
      );
      expect(result.logoUsage).toBe('Default');
      expect(result.latestVersionId).toBe('v-1');
      expect(visualRepo.upsertForBrand).toHaveBeenCalledWith(
        'clxbrand0001',
        { logoUsage: 'Default' },
        expectedEditor,
        null,
      );
    });

    it('threads changeNote when provided', async () => {
      brandRepo.findActiveById.mockResolvedValue(makeBrand());
      visualRepo.upsertForBrand.mockResolvedValue(makeVisual());
      await controller.putVisual(
        'clxbrand0001',
        { logoUsage: 'Default' },
        { changeNote: 'note' },
        adminReq,
      );
      expect(visualRepo.upsertForBrand).toHaveBeenCalledWith(
        'clxbrand0001',
        { logoUsage: 'Default' },
        expectedEditor,
        'note',
      );
    });

    it('throws UnauthorizedException when req.user is missing', async () => {
      const req = {} as RequestWithAuthenticatedUser;
      await expect(
        controller.putVisual('clxbrand0001', { logoUsage: 'Default' }, {}, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws NotFoundException when brand is missing', async () => {
      brandRepo.findActiveById.mockResolvedValue(null);
      await expect(
        controller.putVisual('absent', { logoUsage: 'Default' }, {}, adminReq),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
