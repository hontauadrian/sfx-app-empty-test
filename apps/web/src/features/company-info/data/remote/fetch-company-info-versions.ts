import { executeRequest } from '@/features/presentation/networking';
import { COMPANY_INFO_ENDPOINT } from '../../constants';
import type { CompanyInfoVersionsPageDataModel } from '../model/company-info-version-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchCompanyInfoVersionsParams {
  readonly take?: number;
  readonly cursor?: string;
}

export async function fetchCompanyInfoVersions(
  params: FetchCompanyInfoVersionsParams = {},
): Promise<CompanyInfoVersionsPageDataModel> {
  const search = new URLSearchParams();
  if (typeof params.take === 'number' && Number.isFinite(params.take)) {
    search.append('take', String(params.take));
  }
  if (typeof params.cursor === 'string' && params.cursor.length > 0) {
    search.append('cursor', params.cursor);
  }
  const queryString = search.toString();
  const path = `${COMPANY_INFO_ENDPOINT}/versions${queryString.length > 0 ? `?${queryString}` : ''}`;
  const response = await executeRequest<ApiEnvelope<CompanyInfoVersionsPageDataModel>>({ path });
  return response.data.data;
}
