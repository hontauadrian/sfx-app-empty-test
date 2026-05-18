import { describe, expect, it } from 'vitest';
import {
  brandMetadataResponseSchema,
  createDosDontsEntrySchema,
  dosDontsEntryResponseSchema,
  dosDontsListQuerySchema,
  dosDontsListResponseSchema,
  guidelineSearchGroupSchema,
  guidelineSearchItemSchema,
  guidelineSearchQuerySchema,
  guidelineSearchResponseSchema,
  guidelineSearchSectionSchema,
  updateDosDontsEntrySchema,
  upsertBrandMetadataSchema,
} from '../brand-guidelines.schema';

describe('createDosDontsEntrySchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'Use friendly tone.',
    });
    expect(r.success).toBe(true);
  });

  it('trims ruleText and exampleText', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'dont',
      category: 'legal',
      ruleText: '  Avoid copyrighted assets.  ',
      exampleText: '  e.g. Disney logo  ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ruleText).toBe('Avoid copyrighted assets.');
      expect(r.data.exampleText).toBe('e.g. Disney logo');
    }
  });

  it('rejects empty ruleText with the documented message', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: '   ',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'Rule text is required')).toBe(true);
    }
  });

  it('rejects 4001-char ruleText', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'x'.repeat(4001),
    });
    expect(r.success).toBe(false);
  });

  it('accepts 4000-char ruleText', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'x'.repeat(4000),
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'maybe',
      category: 'tone',
      ruleText: 'rule',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown category', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'spice',
      ruleText: 'rule',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown body keys (.strict)', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'r',
      brandId: 'leak',
    });
    expect(r.success).toBe(false);
  });

  it('rejects 4001-char exampleText', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'r',
      exampleText: 'x'.repeat(4001),
    });
    expect(r.success).toBe(false);
  });

  it('accepts null exampleText (nullish)', () => {
    const r = createDosDontsEntrySchema.safeParse({
      type: 'do',
      category: 'tone',
      ruleText: 'r',
      exampleText: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('updateDosDontsEntrySchema', () => {
  it('accepts an empty PATCH body', () => {
    const r = updateDosDontsEntrySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts a single-field update', () => {
    const r = updateDosDontsEntrySchema.safeParse({ ruleText: 'New' });
    expect(r.success).toBe(true);
  });

  it('still validates field constraints', () => {
    const r = updateDosDontsEntrySchema.safeParse({ ruleText: '' });
    expect(r.success).toBe(false);
  });

  it('rejects unknown body keys (.strict)', () => {
    const r = updateDosDontsEntrySchema.safeParse({ brandId: 'leak' });
    expect(r.success).toBe(false);
  });
});

describe('dosDontsEntryResponseSchema', () => {
  const sample = {
    id: 'clxdd0001',
    brandId: 'clxbrand0001',
    type: 'do' as const,
    category: 'tone' as const,
    ruleText: 'rule',
    exampleText: null as string | null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  };

  it('accepts a valid record', () => {
    expect(dosDontsEntryResponseSchema.safeParse(sample).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(
      dosDontsEntryResponseSchema.safeParse({ ...sample, deletedAt: null }).success,
    ).toBe(false);
  });
});

describe('dosDontsListQuerySchema', () => {
  it('accepts empty filters', () => {
    expect(dosDontsListQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts each filter independently', () => {
    expect(dosDontsListQuerySchema.safeParse({ type: 'do' }).success).toBe(true);
    expect(dosDontsListQuerySchema.safeParse({ category: 'legal' }).success).toBe(true);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(
      dosDontsListQuerySchema.safeParse({ type: 'do', limit: 10 }).success,
    ).toBe(false);
  });

  it('rejects bad enum values', () => {
    expect(dosDontsListQuerySchema.safeParse({ type: 'sometimes' }).success).toBe(false);
    expect(
      dosDontsListQuerySchema.safeParse({ category: 'random' }).success,
    ).toBe(false);
  });
});

describe('dosDontsListResponseSchema', () => {
  it('accepts an empty items array with latestVersionId null', () => {
    expect(
      dosDontsListResponseSchema.safeParse({ items: [], latestVersionId: null }).success,
    ).toBe(true);
  });

  it('accepts populated latestVersionId', () => {
    expect(
      dosDontsListResponseSchema.safeParse({ items: [], latestVersionId: 'clxbgv0001' }).success,
    ).toBe(true);
  });

  it('rejects when latestVersionId field is missing', () => {
    expect(dosDontsListResponseSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rejects when latestVersionId is empty string', () => {
    expect(
      dosDontsListResponseSchema.safeParse({ items: [], latestVersionId: '' }).success,
    ).toBe(false);
  });
});

describe('upsertBrandMetadataSchema', () => {
  it('accepts omitted tags', () => {
    expect(upsertBrandMetadataSchema.safeParse({}).success).toBe(true);
  });

  it('accepts empty tags (explicit clear)', () => {
    expect(upsertBrandMetadataSchema.safeParse({ tags: [] }).success).toBe(true);
  });

  it('accepts populated tags', () => {
    expect(
      upsertBrandMetadataSchema.safeParse({ tags: ['en', 'spring'] }).success,
    ).toBe(true);
  });

  it('rejects empty-string tag', () => {
    expect(upsertBrandMetadataSchema.safeParse({ tags: [''] }).success).toBe(false);
  });

  it('rejects tag longer than 80 chars', () => {
    expect(
      upsertBrandMetadataSchema.safeParse({ tags: ['x'.repeat(81)] }).success,
    ).toBe(false);
  });

  it('accepts exactly 64 tags', () => {
    const tags = Array.from({ length: 64 }, (_, i) => `tag-${i}`);
    expect(upsertBrandMetadataSchema.safeParse({ tags }).success).toBe(true);
  });

  it('rejects 65 tags', () => {
    const tags = Array.from({ length: 65 }, (_, i) => `tag-${i}`);
    expect(upsertBrandMetadataSchema.safeParse({ tags }).success).toBe(false);
  });

  it('rejects unknown body keys (.strict)', () => {
    expect(
      upsertBrandMetadataSchema.safeParse({ tags: [], owner: 'x' }).success,
    ).toBe(false);
  });
});

describe('brandMetadataResponseSchema', () => {
  it('accepts a valid record with latestVersionId', () => {
    const r = brandMetadataResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'subject-admin',
      tags: ['en'],
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: 'clxbgv0001',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latestVersionId).toBe('clxbgv0001');
  });

  it('accepts latestVersionId null', () => {
    const r = brandMetadataResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'subject-admin',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      latestVersionId: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latestVersionId).toBeNull();
  });

  it('rejects record without latestVersionId', () => {
    const r = brandMetadataResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      ownerUserId: 'subject-owner',
      lastUpdatedAt: new Date(),
      lastUpdatedByUserId: 'subject-admin',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(r.success).toBe(false);
  });
});

describe('guidelineSearchQuerySchema', () => {
  it('accepts empty', () => {
    expect(guidelineSearchQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a string q', () => {
    expect(
      guidelineSearchQuerySchema.safeParse({ q: 'wordmark' }).success,
    ).toBe(true);
  });

  it('rejects q longer than 200 chars', () => {
    expect(
      guidelineSearchQuerySchema.safeParse({ q: 'x'.repeat(201) }).success,
    ).toBe(false);
  });

  it('accepts q exactly 200 chars', () => {
    expect(
      guidelineSearchQuerySchema.safeParse({ q: 'x'.repeat(200) }).success,
    ).toBe(true);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(
      guidelineSearchQuerySchema.safeParse({ q: 'wordmark', limit: 5 }).success,
    ).toBe(false);
  });
});

describe('guidelineSearch sub-schemas', () => {
  it('section enum is constrained', () => {
    expect(guidelineSearchSectionSchema.safeParse('voice').success).toBe(true);
    expect(guidelineSearchSectionSchema.safeParse('random').success).toBe(false);
  });

  it('item schema requires every documented field', () => {
    expect(
      guidelineSearchItemSchema.safeParse({
        id: 'x',
        sectionTitleKey: 'k',
        matchedFieldKey: 'k',
        fragment: 'frag',
        href: '/h',
      }).success,
    ).toBe(true);
  });

  it('item schema rejects fragment > 200 chars', () => {
    expect(
      guidelineSearchItemSchema.safeParse({
        id: 'x',
        sectionTitleKey: 'k',
        matchedFieldKey: 'k',
        fragment: 'x'.repeat(201),
        href: '/h',
      }).success,
    ).toBe(false);
  });

  it('group schema requires items array', () => {
    expect(
      guidelineSearchGroupSchema.safeParse({ section: 'metadata', items: [] }).success,
    ).toBe(true);
  });

  it('response schema accepts an empty groups array', () => {
    expect(
      guidelineSearchResponseSchema.safeParse({
        query: '',
        brandId: 'b1',
        groups: [],
      }).success,
    ).toBe(true);
  });
});
