import {
  GUIDELINE_SEARCH_SECTIONS,
  type GuidelineSearchGroup,
  type GuidelineSearchItem,
  type GuidelineSearchRepository,
  type GuidelineSearchResult,
} from '../guideline-search-repository';

describe('GUIDELINE_SEARCH_SECTIONS', () => {
  it('enumerates the four sections in declared order', () => {
    expect(GUIDELINE_SEARCH_SECTIONS).toEqual([
      'voice',
      'visual',
      'dos-and-donts',
      'metadata',
    ]);
  });
});

describe('GuidelineSearchRepository port', () => {
  function buildItem(overrides: Partial<GuidelineSearchItem> = {}): GuidelineSearchItem {
    return {
      id: 'entry-1',
      sectionTitleKey: 'admin.brandGuidelines.dosAndDonts.title',
      matchedFieldKey: 'admin.brandGuidelines.dosAndDonts.fields.ruleText',
      fragment: 'Use the official wordmark in marketing.',
      href: '/admin/brand-guidelines/brand-1?section=dosAndDonts#entry-entry-1',
      ...overrides,
    };
  }

  it('shape: search returns echoed query + brand + grouped items', async () => {
    const repo: GuidelineSearchRepository = {
      async searchByBrand({ brandId, query }) {
        const groups: GuidelineSearchGroup[] =
          query.length === 0
            ? []
            : [
                { section: 'dos-and-donts', items: [buildItem()] },
                { section: 'metadata', items: [] },
              ];
        const result: GuidelineSearchResult = { query, brandId, groups };
        return result;
      },
    };

    const empty = await repo.searchByBrand({ brandId: 'brand-1', query: '' });
    expect(empty.query).toBe('');
    expect(empty.groups).toEqual([]);

    const populated = await repo.searchByBrand({ brandId: 'brand-1', query: 'word' });
    expect(populated.brandId).toBe('brand-1');
    expect(populated.groups).toHaveLength(2);
    expect(populated.groups[0]?.section).toBe('dos-and-donts');
  });
});
