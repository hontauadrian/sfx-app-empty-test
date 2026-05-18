import type { CompanyInfoDataModel } from './company-info-data-model';

export interface CompanyInfoVersionDataModel {
  readonly id: string;
  readonly companyInfoId: string;
  readonly snapshot: CompanyInfoDataModel;
  readonly editorUserId: string;
  readonly editorDisplayName: string;
  readonly createdAt: string;
}

export interface CompanyInfoVersionsPageDataModel {
  readonly items: readonly CompanyInfoVersionDataModel[];
  readonly nextCursor: string | null;
}
