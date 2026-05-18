import { describe, expect, it } from 'vitest';
import { mapToGuidelineSearchResult } from '../map-to-guideline-search-result';

describe('mapToGuidelineSearchResult', () => {
  it('passes groups + items through unchanged in shape', () => {
    const result = mapToGuidelineSearchResult({
      query: 'q',
      brandId: 'b1',
      groups: [
        {
          section: 'dos-and-donts',
          items: [
            {
              id: 'x',
              sectionTitleKey: 'k',
              matchedFieldKey: 'k',
              fragment: 'f',
              href: '/h',
            },
          ],
        },
      ],
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.items[0]?.href).toBe('/h');
  });

  it('handles empty groups', () => {
    expect(mapToGuidelineSearchResult({ query: '', brandId: 'b', groups: [] }).groups).toEqual([]);
  });
});
