import { executeRequest } from '@/features/presentation/networking';
import { COMPANY_INFO_ENDPOINT } from '../../constants';
import type { CompanyInfoVersionDataModel } from '../model/company-info-version-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchCompanyInfoVersionById(
  id: string,
): Promise<CompanyInfoVersionDataModel> {
  const response = await executeRequest<ApiEnvelope<CompanyInfoVersionDataModel>>({
    path: `${COMPANY_INFO_ENDPOINT}/versions/${encodeURIComponent(id)}`,
  });
  return response.data.data;
}
