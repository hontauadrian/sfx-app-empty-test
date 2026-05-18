import type { UpsertCompanyInfoInput } from '@sfx/domain';
import { executeRequest } from '@/features/presentation/networking';
import { COMPANY_INFO_ENDPOINT } from '../../constants';
import type { CompanyInfoDataModel } from '../model/company-info-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function updateCompanyInfo(
  input: UpsertCompanyInfoInput,
): Promise<CompanyInfoDataModel> {
  const response = await executeRequest<ApiEnvelope<CompanyInfoDataModel>>({
    path: COMPANY_INFO_ENDPOINT,
    method: 'PUT',
    body: input,
  });
  return response.data.data;
}
