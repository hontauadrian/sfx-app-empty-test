import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandDataModel } from '../model/brand-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function createBrand(input: { readonly name: string }): Promise<BrandDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandDataModel>>({
    path: BRANDS_ENDPOINT,
    method: 'POST',
    body: input,
  });
  return response.data.data;
}
