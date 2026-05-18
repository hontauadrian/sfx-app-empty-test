import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
  Brand,
  BrandRepository,
  GuidelineSearchRepository,
  GuidelineSearchResult,
} from '@sfx/domain';
import { GuidelineSearchController } from '../guideline-search.controller';

interface RepoMock {
  searchByBrand: Mock;
}

interface BrandRepoMock {
  listActive: Mock;
  findActiveById: Mock;
  create: Mock;
  renameById: Mock;
  softDeleteById: Mock;
}

const brand: Brand = {
  id: 'b1',
  name: 'Acme',
  slug: 'acme',
  ownerUserId: 'subject-owner',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('GuidelineSearchController', () => {
  let repo: RepoMock;
  let brandRepo: BrandRepoMock;
  let controller: GuidelineSearchController;

  beforeEach(() => {
    repo = { searchByBrand: vi.fn() };
    brandRepo = {
      listActive: vi.fn(),
      findActiveById: vi.fn().mockResolvedValue(brand),
      create: vi.fn(),
      renameById: vi.fn(),
      softDeleteById: vi.fn(),
    };
    controller = new GuidelineSearchController(
      repo as unknown as GuidelineSearchRepository,
      brandRepo as unknown as BrandRepository,
    );
  });

  it('returns the search result', async () => {
    const result: GuidelineSearchResult = { query: 'q', brandId: 'b1', groups: [] };
    repo.searchByBrand.mockResolvedValue(result);
    expect(await controller.search('b1', { q: 'q' })).toEqual(result);
    expect(repo.searchByBrand).toHaveBeenCalledWith({ brandId: 'b1', query: 'q' });
  });

  it('forwards empty q as empty string', async () => {
    repo.searchByBrand.mockResolvedValue({ query: '', brandId: 'b1', groups: [] });
    await controller.search('b1', {});
    expect(repo.searchByBrand).toHaveBeenCalledWith({ brandId: 'b1', query: '' });
  });

  it('throws 404 when brand missing', async () => {
    brandRepo.findActiveById.mockResolvedValue(null);
    await expect(controller.search('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.searchByBrand).not.toHaveBeenCalled();
  });
});
