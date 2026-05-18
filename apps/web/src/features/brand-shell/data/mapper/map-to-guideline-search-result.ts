import type { GuidelineSearchResult } from '@sfx/domain';
import type { GuidelineSearchResponseDataModel } from '../model/guideline-search-data-model';

export function mapToGuidelineSearchResult(
  model: GuidelineSearchResponseDataModel,
): GuidelineSearchResult {
  return {
    query: model.query,
    brandId: model.brandId,
    groups: model.groups.map((group) => ({
      section: group.section,
      items: group.items.map((item) => ({
        id: item.id,
        sectionTitleKey: item.sectionTitleKey,
        matchedFieldKey: item.matchedFieldKey,
        fragment: item.fragment,
        href: item.href,
      })),
    })),
  };
}
