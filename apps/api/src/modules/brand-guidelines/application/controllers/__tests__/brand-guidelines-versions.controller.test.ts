import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type {
  Brand,
  BrandGuidelinesVersion,
  BrandRepository,
  BrandGuidelinesVersionRepository,
  ListBrandGuidelinesVersionsResult,
} from '@sfx/domain';
import { BrandGuidelinesVersionsController } from '../brand-guidelines-versions.controller';

function makeActiveBrand(id: string): Brand {
  return {
    id,
    name: 'Brand',
    slug: 'brand',
    ownerUserId: 'owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as Brand;
}

function makeVersion(overrides: Partial<BrandGuidelinesVersion> = {}): BrandGuidelinesVersion {
  return {
    id: overrides.id ?? 'v-1',
    brandId: overrides.brandId ?? 'brand-1',
    snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
    editorUserId: 'user-1',
    editorDisplayName: 'Admin One',
    changeNote: null,
    createdAt: new Date(),
    ...overrides,
  } as BrandGuidelinesVersion;
}

function makeController(opts: {
  brand?: Brand | null;
  list?: ListBrandGuidelinesVersionsResult;
  findById?: BrandGuidelinesVersion | null;
} = {}): {
  controller: BrandGuidelinesVersionsController;
  brandRepo: BrandRepository;
  versionRepo: BrandGuidelinesVersionRepository;
} {
  const brandRepo: BrandRepository = {
    findActiveById: vi.fn().mockResolvedValue(opts.brand ?? null),
    findById: vi.fn(),
    create: vi.fn(),
    renameById: vi.fn(),
    softDeleteById: vi.fn(),
    listActive: vi.fn(),
    findActiveBySlug: vi.fn(),
  } as unknown as BrandRepository;
  const versionRepo: BrandGuidelinesVersionRepository = {
    list: vi.fn().mockResolvedValue(opts.list ?? { items: [], nextCursor: null }),
    findById: vi.fn().mockResolvedValue(opts.findById ?? null),
    findLatestForBrand: vi.fn(),
  } as unknown as BrandGuidelinesVersionRepository;
  return {
    controller: new BrandGuidelinesVersionsController(brandRepo, versionRepo),
    brandRepo,
    versionRepo,
  };
}

describe('BrandGuidelinesVersionsController.listVersions', () => {
  it('returns the repository page when brand is active', async () => {
    const page: ListBrandGuidelinesVersionsResult = {
      items: [makeVersion({ id: 'v-1', brandId: 'brand-1' })],
      nextCursor: null,
    };
    const { controller, brandRepo, versionRepo } = makeController({
      brand: makeActiveBrand('brand-1'),
      list: page,
    });
    const result = await controller.listVersions('brand-1', { take: 10 });
    expect(result.items[0]?.id).toBe('v-1');
    expect(brandRepo.findActiveById).toHaveBeenCalledWith('brand-1');
    expect(versionRepo.list).toHaveBeenCalledWith({
      brandId: 'brand-1',
      take: 10,
      cursor: undefined,
      q: undefined,
    });
  });

  it('applies default take when omitted from query', async () => {
    const { controller, versionRepo } = makeController({ brand: makeActiveBrand('brand-1') });
    await controller.listVersions('brand-1', {});
    expect(versionRepo.list).toHaveBeenCalledWith({
      brandId: 'brand-1',
      take: 50,
      cursor: undefined,
      q: undefined,
    });
  });

  it('threads cursor + q through to repository and skips the brand-active check when cursor is present', async () => {
    const { controller, brandRepo, versionRepo } = makeController({ brand: null });
    await controller.listVersions('brand-1', { take: 25, cursor: 'v-mid', q: 'rebrand' });
    expect(brandRepo.findActiveById).not.toHaveBeenCalled();
    expect(versionRepo.list).toHaveBeenCalledWith({
      brandId: 'brand-1',
      take: 25,
      cursor: 'v-mid',
      q: 'rebrand',
    });
  });

  it('throws NotFoundException when brand is missing on the unparameterised first page', async () => {
    const { controller } = makeController({ brand: null });
    await expect(controller.listVersions('brand-x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('BrandGuidelinesVersionsController.findVersionById', () => {
  it('returns the version when brand and version match', async () => {
    const { controller } = makeController({
      brand: makeActiveBrand('brand-1'),
      findById: makeVersion({ id: 'v-1', brandId: 'brand-1' }),
    });
    const result = await controller.findVersionById('brand-1', 'v-1');
    expect(result.id).toBe('v-1');
  });

  it('throws NotFoundException when brand is missing', async () => {
    const { controller } = makeController({ brand: null });
    await expect(controller.findVersionById('brand-x', 'v-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when version is missing', async () => {
    const { controller } = makeController({
      brand: makeActiveBrand('brand-1'),
      findById: null,
    });
    await expect(controller.findVersionById('brand-1', 'v-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when version belongs to a different brand (no leak)', async () => {
    const { controller } = makeController({
      brand: makeActiveBrand('brand-1'),
      findById: makeVersion({ id: 'v-1', brandId: 'brand-2' }),
    });
    await expect(controller.findVersionById('brand-1', 'v-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
