import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { PrismaClient } from '@sfx/database';
import { GuidelineSearchPrismaRepository } from '../guideline-search.repository';

interface PrismaMock {
  dosDontsEntry: { findMany: Mock };
  brandMetadata: { findUnique: Mock };
  _dmmf: { modelMap: Record<string, unknown> };
}

function makePrismaMock(): PrismaMock {
  return {
    dosDontsEntry: { findMany: vi.fn().mockResolvedValue([]) },
    brandMetadata: { findUnique: vi.fn().mockResolvedValue(null) },
    _dmmf: { modelMap: { DosDontsEntry: {}, BrandMetadata: {} } },
  };
}

describe('GuidelineSearchPrismaRepository', () => {
  let prisma: PrismaMock;
  let repo: GuidelineSearchPrismaRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    repo = new GuidelineSearchPrismaRepository(prisma as unknown as PrismaClient);
  });

  it('empty query short-circuits to empty groups without hitting DB', async () => {
    const result = await repo.searchByBrand({ brandId: 'b1', query: '   ' });
    expect(result).toEqual({ query: '', brandId: 'b1', groups: [] });
    expect(prisma.dosDontsEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.brandMetadata.findUnique).not.toHaveBeenCalled();
  });

  it('returns a dos-and-donts group when a rule matches', async () => {
    prisma.dosDontsEntry.findMany.mockResolvedValue([
      {
        id: 'dd1',
        brandId: 'b1',
        type: 'do',
        category: 'tone',
        ruleText: 'Always use the official wordmark in marketing.',
        exampleText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'wordmark' });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      section: 'dos-and-donts',
      items: [
        expect.objectContaining({
          id: 'dd1',
          matchedFieldKey: 'admin.brandGuidelines.dosAndDonts.fields.ruleText.label',
          href: '/admin/brand-guidelines/b1?section=dosAndDonts#entry-dd1',
        }),
      ],
    });
  });

  it('marks the matched field as exampleText when only exampleText matches', async () => {
    prisma.dosDontsEntry.findMany.mockResolvedValue([
      {
        id: 'dd1',
        brandId: 'b1',
        type: 'do',
        category: 'tone',
        ruleText: 'Be friendly.',
        exampleText: 'No legalese in headers.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'legalese' });
    expect(result.groups[0]?.items[0]?.matchedFieldKey).toBe(
      'admin.brandGuidelines.dosAndDonts.fields.exampleText.label',
    );
  });

  it('returns a metadata group when a tag matches', async () => {
    prisma.brandMetadata.findUnique.mockResolvedValue({
      brandId: 'b1',
      ownerUserId: 'o',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'a',
      tags: ['campaign-spring', 'EN'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'campaign' });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({
      section: 'metadata',
      items: [expect.objectContaining({ href: '/admin/brand-guidelines/b1?section=metadata' })],
    });
  });

  it('returns no metadata group when no tag matches', async () => {
    prisma.brandMetadata.findUnique.mockResolvedValue({
      brandId: 'b1',
      ownerUserId: 'o',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'a',
      tags: ['unrelated'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'wordmark' });
    expect(result.groups).toEqual([]);
  });

  it('echoes trimmed query in response', async () => {
    const result = await repo.searchByBrand({ brandId: 'b1', query: '  wordmark  ' });
    expect(result.query).toBe('wordmark');
  });

  it('skips voice/visual sections when their models are not present in dmmf', async () => {
    prisma._dmmf.modelMap = { DosDontsEntry: {}, BrandMetadata: {} };
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'wordmark' });
    expect(result.groups.find((g) => g.section === 'voice')).toBeUndefined();
    expect(result.groups.find((g) => g.section === 'visual')).toBeUndefined();
  });

  it('builds a contextual fragment around the hit when source is long', async () => {
    const longRule =
      'before '.repeat(40) + 'WORDMARK' + ' after'.repeat(40);
    prisma.dosDontsEntry.findMany.mockResolvedValue([
      {
        id: 'dd1',
        brandId: 'b1',
        type: 'do',
        category: 'tone',
        ruleText: longRule,
        exampleText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const result = await repo.searchByBrand({ brandId: 'b1', query: 'wordmark' });
    const fragment = result.groups[0]?.items[0]?.fragment ?? '';
    expect(fragment.length).toBeLessThanOrEqual(200);
    expect(fragment.toLowerCase()).toContain('wordmark');
  });
});
