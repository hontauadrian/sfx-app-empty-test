import { executeRequest } from '@/features/presentation/networking';
import { brandMetadataEndpoint } from '../../constants';
import type { BrandMetadataDataModel } from '../model/brand-metadata-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrandMetadata(input: {
  readonly brandId: string;
}): Promise<BrandMetadataDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandMetadataDataModel>>({
    path: brandMetadataEndpoint(input.brandId),
  });
  return response.data.data;
}
