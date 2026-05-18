import type { CompanyInfoVersion, ListCompanyInfoVersionsResult } from '@sfx/domain';
import type {
  CompanyInfoVersionDataModel,
  CompanyInfoVersionsPageDataModel,
} from '../model/company-info-version-data-model';
import { mapToCompanyInfo } from './map-to-company-info';

export function mapToCompanyInfoVersion(data: CompanyInfoVersionDataModel): CompanyInfoVersion {
  return {
    id: data.id,
    companyInfoId: data.companyInfoId,
    snapshot: mapToCompanyInfo(data.snapshot),
    editorUserId: data.editorUserId,
    editorDisplayName: data.editorDisplayName,
    createdAt: new Date(data.createdAt),
  };
}

export function mapToCompanyInfoVersionsPage(
  data: CompanyInfoVersionsPageDataModel,
): ListCompanyInfoVersionsResult {
  return {
    items: data.items.map(mapToCompanyInfoVersion),
    nextCursor: data.nextCursor,
  };
}
