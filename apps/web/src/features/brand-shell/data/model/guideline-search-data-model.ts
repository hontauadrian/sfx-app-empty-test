export interface GuidelineSearchItemDataModel {
  readonly id: string;
  readonly sectionTitleKey: string;
  readonly matchedFieldKey: string;
  readonly fragment: string;
  readonly href: string;
}

export interface GuidelineSearchGroupDataModel {
  readonly section: 'voice' | 'visual' | 'dos-and-donts' | 'metadata';
  readonly items: readonly GuidelineSearchItemDataModel[];
}

export interface GuidelineSearchResponseDataModel {
  readonly query: string;
  readonly brandId: string;
  readonly groups: readonly GuidelineSearchGroupDataModel[];
}
