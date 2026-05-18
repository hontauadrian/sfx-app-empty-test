import {
  DOS_DONTS_CATEGORIES,
  DOS_DONTS_TYPES,
  type CreateDosDontsEntryInput,
  type DosDontsCategory,
  type DosDontsEntry,
  type DosDontsType,
  type ListDosDontsFilters,
  type UpdateDosDontsEntryInput,
} from '../dos-donts-entry';

describe('DOS_DONTS_TYPES', () => {
  it('exposes exactly the two ASCII-safe values', () => {
    expect(DOS_DONTS_TYPES).toEqual(['do', 'dont']);
  });

  it('is frozen as a const tuple at the type level', () => {
    const acceptOnly: DosDontsType = 'do';
    expect(acceptOnly).toBe('do');
  });
});

describe('DOS_DONTS_CATEGORIES', () => {
  it('ships the five founding values in declared order', () => {
    expect(DOS_DONTS_CATEGORIES).toEqual([
      'tone',
      'vocabulary',
      'visuals',
      'legal',
      'campaign-messaging',
    ]);
  });

  it('narrows DosDontsCategory to the tuple members', () => {
    const sample: DosDontsCategory = 'campaign-messaging';
    expect(DOS_DONTS_CATEGORIES).toContain(sample);
  });
});

describe('DosDontsEntry shape', () => {
  it('accepts a fully populated entry', () => {
    const entry: DosDontsEntry = {
      id: 'entry-1',
      brandId: 'brand-1',
      type: 'do',
      category: 'tone',
      ruleText: 'Use the official wordmark.',
      exampleText: 'Marketing emails',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    expect(entry.id).toBe('entry-1');
    expect(entry.exampleText).toBe('Marketing emails');
  });

  it('allows null exampleText', () => {
    const entry: DosDontsEntry = {
      id: 'entry-1',
      brandId: 'brand-1',
      type: 'dont',
      category: 'legal',
      ruleText: 'No copyrighted assets.',
      exampleText: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(entry.exampleText).toBeNull();
  });
});

describe('CreateDosDontsEntryInput', () => {
  it('requires type, category, ruleText; allows omitted exampleText', () => {
    const input: CreateDosDontsEntryInput = {
      type: 'do',
      category: 'tone',
      ruleText: 'Speak warmly.',
    };
    expect(input.exampleText).toBeUndefined();
  });

  it('allows explicit null exampleText', () => {
    const input: CreateDosDontsEntryInput = {
      type: 'dont',
      category: 'vocabulary',
      ruleText: 'No internal jargon.',
      exampleText: null,
    };
    expect(input.exampleText).toBeNull();
  });
});

describe('UpdateDosDontsEntryInput', () => {
  it('allows every field optional (PATCH semantics)', () => {
    const empty: UpdateDosDontsEntryInput = {};
    const partial: UpdateDosDontsEntryInput = { ruleText: 'New rule' };
    const full: UpdateDosDontsEntryInput = {
      type: 'dont',
      category: 'visuals',
      ruleText: 'No off-palette imagery.',
      exampleText: 'Reject magenta hero banners.',
    };
    expect(empty).toEqual({});
    expect(partial.ruleText).toBe('New rule');
    expect(full.category).toBe('visuals');
  });
});

describe('ListDosDontsFilters', () => {
  it('supports zero, one, or both filters', () => {
    const none: ListDosDontsFilters = {};
    const onlyType: ListDosDontsFilters = { type: 'do' };
    const onlyCategory: ListDosDontsFilters = { category: 'legal' };
    const both: ListDosDontsFilters = { type: 'dont', category: 'tone' };
    expect(none).toEqual({});
    expect(onlyType.type).toBe('do');
    expect(onlyCategory.category).toBe('legal');
    expect(both).toEqual({ type: 'dont', category: 'tone' });
  });
});
