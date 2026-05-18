import { describe, expect, it } from 'vitest';
import type {
  GuidelineSearchGroupDataModel,
  GuidelineSearchItemDataModel,
  GuidelineSearchResponseDataModel,
} from '../guideline-search-data-model';

describe('Guideline search data models', () => {
  it('accept a populated response', () => {
    const item: GuidelineSearchItemDataModel = {
      id: 'x',
      sectionTitleKey: 'k',
      matchedFieldKey: 'k',
      fragment: 'f',
      href: '/h',
    };
    const group: GuidelineSearchGroupDataModel = {
      section: 'dos-and-donts',
      items: [item],
    };
    const response: GuidelineSearchResponseDataModel = {
      query: 'q',
      brandId: 'b',
      groups: [group],
    };
    expect(response.groups[0]?.items[0]?.href).toBe('/h');
  });
});
