import { executeRequest } from '@/features/presentation/networking';
import { COMPANY_INFO_ENDPOINT } from '../../constants';
import type { CompanyInfoDataModel } from '../model/company-info-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchCompanyInfo(): Promise<CompanyInfoDataModel | null> {
  const response = await executeRequest<ApiEnvelope<CompanyInfoDataModel | null>>({ path: COMPANY_INFO_ENDPOINT });
  return response.data.data;
}
