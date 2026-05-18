import { executeRequest } from '@/features/presentation/networking';
import { brandGuidelinesVersionsEndpoint } from '../../constants';
import type { BrandGuidelinesVersionsPageDataModel } from '../model/brand-guidelines-version-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchBrandGuidelinesVersionsParams {
  readonly take?: number;
  readonly cursor?: string;
}

export async function fetchBrandGuidelinesVersions(
  brandId: string,
  params: FetchBrandGuidelinesVersionsParams = {},
): Promise<BrandGuidelinesVersionsPageDataModel> {
  const search = new URLSearchParams();
  if (params.take !== undefined) search.set('take', String(params.take));
  if (params.cursor !== undefined && params.cursor !== '') {
    search.set('cursor', params.cursor);
  }
  const query = search.toString();
  const path = query
    ? `${brandGuidelinesVersionsEndpoint(brandId)}?${query}`
    : brandGuidelinesVersionsEndpoint(brandId);
  const response = await executeRequest<ApiEnvelope<BrandGuidelinesVersionsPageDataModel>>({
    path,
  });
  return response.data.data;
}
