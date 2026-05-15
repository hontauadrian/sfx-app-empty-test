import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrandById(id: string): Promise<BrandProfileDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandProfileDataModel>>({
    path: `${BRANDS_ENDPOINT}/${id}`,
  });
  return response.data.data;
}
