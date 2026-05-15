import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface CreateBrandInput {
  readonly name: string;
  readonly description?: string | null;
}

export async function createBrand(
  input: CreateBrandInput,
): Promise<BrandProfileDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandProfileDataModel>>({
    path: BRANDS_ENDPOINT,
    method: 'POST',
    body: input,
  });
  return response.data.data;
}
