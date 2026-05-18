import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';
import type { BrandDataModel } from '../model/brand-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrands(): Promise<readonly BrandDataModel[]> {
  const response = await executeRequest<ApiEnvelope<{ brands: readonly BrandDataModel[] }>>({
    path: BRANDS_ENDPOINT,
  });
  return response.data.data.brands;
}
