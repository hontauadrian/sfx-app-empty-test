import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrands(): Promise<BrandProfileDataModel[]> {
  const response = await executeRequest<ApiEnvelope<BrandProfileDataModel[]>>({
    path: BRANDS_ENDPOINT,
  });
  return response.data.data;
}
