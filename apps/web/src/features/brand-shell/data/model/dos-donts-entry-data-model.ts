export interface DosDontsEntryDataModel {
  readonly id: string;
  readonly brandId: string;
  readonly type: 'do' | 'dont';
  readonly category: string;
  readonly ruleText: string;
  readonly exampleText: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
