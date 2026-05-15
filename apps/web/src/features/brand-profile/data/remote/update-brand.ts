import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandProfileDataModel } from '../model/brand-profile-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpdateBrandInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
}

export async function updateBrand(
  input: UpdateBrandInput,
): Promise<BrandProfileDataModel> {
  const { id, ...body } = input;
  const response = await executeRequest<ApiEnvelope<BrandProfileDataModel>>({
    path: `${BRANDS_ENDPOINT}/${id}`,
    method: 'PUT',
    body,
  });
  return response.data.data;
}
