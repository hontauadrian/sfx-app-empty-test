import { describe, expect, it } from 'vitest';
import {
  brandGuidelinesSnapshotSchema,
  brandGuidelinesVersionResponseSchema,
  brandGuidelinesVersionsPageSchema,
  changeNoteQuerySchema,
  listBrandGuidelinesVersionsQuerySchema,
} from '../brand-guidelines-version.schema';

const validVoice = {
  brandId: 'clxbrand0001',
  tone: 'Bold',
  preferredVocabulary: ['craft'],
  restrictedVocabulary: ['cheap'],
  messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
  writingStyleRules: 'Short sentences.',
  audienceRules: [{ audience: 'Buyers', rules: 'Lead with value.' }],
  approvedExamples: [{ phrase: 'Partner up.' }],
  rejectedExamples: [{ phrase: 'Cheap deal', reason: null }],
  createdAt: new Date('2026-05-17T00:00:00.000Z'),
  updatedAt: new Date('2026-05-17T01:00:00.000Z'),
  latestVersionId: 'clxbgv0001',
};

const validVisual = {
  brandId: 'clxbrand0001',
  logoUsage: 'Default',
  colorPalette: [{ name: 'Primary', hex: '#1A2B3C', usageNotes: null }],
  typography: [{ font: 'Inter', weight: '500', usageContext: null }],
  spacingGuidance: null,
  imageStyleGuidance: null,
  iconographyGuidance: null,
  usageRestrictions: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  latestVersionId: 'clxbgv0001',
};

const validMetadata = {
  brandId: 'clxbrand0001',
  ownerUserId: 'subject-owner',
  lastUpdatedAt: new Date(),
  lastUpdatedByUserId: 'subject-admin',
  tags: ['en'],
  createdAt: new Date(),
  updatedAt: new Date(),
  latestVersionId: 'clxbgv0001',
};

const validDosDontsEntry = {
  id: 'dd-1',
  brandId: 'clxbrand0001',
  type: 'do' as const,
  category: 'tone' as const,
  ruleText: 'Be concise',
  exampleText: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('brandGuidelinesSnapshotSchema', () => {
  it('accepts a fully populated snapshot', () => {
    const r = brandGuidelinesSnapshotSchema.safeParse({
      voice: validVoice,
      visual: validVisual,
      dosAndDonts: [validDosDontsEntry],
      metadata: validMetadata,
    });
    expect(r.success).toBe(true);
  });

  it('accepts null sub-resources', () => {
    const r = brandGuidelinesSnapshotSchema.safeParse({
      voice: null,
      visual: null,
      dosAndDonts: [],
      metadata: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects when dosAndDonts is null (must be array)', () => {
    const r = brandGuidelinesSnapshotSchema.safeParse({
      voice: null,
      visual: null,
      dosAndDonts: null,
      metadata: null,
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys (.strict)', () => {
    const r = brandGuidelinesSnapshotSchema.safeParse({
      voice: null,
      visual: null,
      dosAndDonts: [],
      metadata: null,
      extra: 'nope',
    });
    expect(r.success).toBe(false);
  });
});

describe('brandGuidelinesVersionResponseSchema', () => {
  it('accepts a fully populated version row', () => {
    const r = brandGuidelinesVersionResponseSchema.safeParse({
      id: 'v-1',
      brandId: 'clxbrand0001',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: 'first save',
      createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('accepts null changeNote', () => {
    const r = brandGuidelinesVersionResponseSchema.safeParse({
      id: 'v-1',
      brandId: 'clxbrand0001',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: null,
      createdAt: new Date(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects changeNote over 500 chars', () => {
    const r = brandGuidelinesVersionResponseSchema.safeParse({
      id: 'v-1',
      brandId: 'clxbrand0001',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: 'x'.repeat(501),
      createdAt: new Date(),
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing id', () => {
    const r = brandGuidelinesVersionResponseSchema.safeParse({
      brandId: 'clxbrand0001',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: null,
      createdAt: new Date(),
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown keys (.strict)', () => {
    const r = brandGuidelinesVersionResponseSchema.safeParse({
      id: 'v-1',
      brandId: 'clxbrand0001',
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: 'user-1',
      editorDisplayName: 'Admin One',
      changeNote: null,
      createdAt: new Date(),
      extra: 'nope',
    });
    expect(r.success).toBe(false);
  });
});

describe('listBrandGuidelinesVersionsQuerySchema', () => {
  it('accepts an empty query (defaults applied at controller)', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a numeric take', () => {
    const r = listBrandGuidelinesVersionsQuerySchema.safeParse({ take: 25 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.take).toBe(25);
  });

  it('coerces string take', () => {
    const r = listBrandGuidelinesVersionsQuerySchema.safeParse({ take: '10' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.take).toBe(10);
  });

  it('rejects take below 1', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({ take: 0 }).success).toBe(false);
  });

  it('rejects take above 100', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({ take: 101 }).success).toBe(false);
  });

  it('rejects non-integer take', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({ take: 5.5 }).success).toBe(false);
  });

  it('accepts a non-empty cursor', () => {
    const r = listBrandGuidelinesVersionsQuerySchema.safeParse({ cursor: 'v-1' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cursor).toBe('v-1');
  });

  it('rejects empty cursor', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(
      listBrandGuidelinesVersionsQuerySchema.safeParse({ take: 10, extra: 'nope' }).success,
    ).toBe(false);
  });

  it('accepts a non-empty q filter', () => {
    const r = listBrandGuidelinesVersionsQuerySchema.safeParse({ q: 'rebrand' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBe('rebrand');
  });

  it('rejects empty q', () => {
    expect(listBrandGuidelinesVersionsQuerySchema.safeParse({ q: '' }).success).toBe(false);
  });

  it('rejects q longer than 200 chars', () => {
    expect(
      listBrandGuidelinesVersionsQuerySchema.safeParse({ q: 'x'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('brandGuidelinesVersionsPageSchema', () => {
  it('accepts an empty page', () => {
    const r = brandGuidelinesVersionsPageSchema.safeParse({ items: [], nextCursor: null });
    expect(r.success).toBe(true);
  });

  it('accepts populated items with a non-null nextCursor', () => {
    const r = brandGuidelinesVersionsPageSchema.safeParse({
      items: [
        {
          id: 'v-1',
          brandId: 'clxbrand0001',
          snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
          editorUserId: 'user-1',
          editorDisplayName: 'Admin',
          changeNote: null,
          createdAt: new Date(),
        },
      ],
      nextCursor: 'v-1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty-string nextCursor', () => {
    const r = brandGuidelinesVersionsPageSchema.safeParse({ items: [], nextCursor: '' });
    expect(r.success).toBe(false);
  });
});

describe('changeNoteQuerySchema', () => {
  it('accepts empty query', () => {
    expect(changeNoteQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a non-empty changeNote', () => {
    const r = changeNoteQuerySchema.safeParse({ changeNote: 'tone tightening' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.changeNote).toBe('tone tightening');
  });

  it('trims surrounding whitespace', () => {
    const r = changeNoteQuerySchema.safeParse({ changeNote: '  note  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.changeNote).toBe('note');
  });

  it('rejects changeNote over 500 chars', () => {
    expect(changeNoteQuerySchema.safeParse({ changeNote: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejects unknown query keys (.strict)', () => {
    expect(changeNoteQuerySchema.safeParse({ extra: 'nope' }).success).toBe(false);
  });
});
