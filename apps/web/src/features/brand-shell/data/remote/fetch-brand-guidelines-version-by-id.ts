import { executeRequest } from '@/features/presentation/networking';
import { brandGuidelinesVersionEndpoint } from '../../constants';
import type { BrandGuidelinesVersionDataModel } from '../model/brand-guidelines-version-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrandGuidelinesVersionById(
  brandId: string,
  versionId: string,
): Promise<BrandGuidelinesVersionDataModel> {
  const path = brandGuidelinesVersionEndpoint(
    encodeURIComponent(brandId),
    encodeURIComponent(versionId),
  );
  const response = await executeRequest<ApiEnvelope<BrandGuidelinesVersionDataModel>>({
    path,
  });
  return response.data.data;
}
