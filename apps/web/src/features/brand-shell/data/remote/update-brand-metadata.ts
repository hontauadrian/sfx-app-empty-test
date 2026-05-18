import { executeRequest } from '@/features/presentation/networking';
import { brandMetadataEndpoint } from '../../constants';
import type { BrandMetadataDataModel } from '../model/brand-metadata-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpdateBrandMetadataInput {
  readonly brandId: string;
  readonly tags?: readonly string[];
}

export async function updateBrandMetadata(
  input: UpdateBrandMetadataInput,
): Promise<BrandMetadataDataModel> {
  const { brandId, ...body } = input;
  const response = await executeRequest<ApiEnvelope<BrandMetadataDataModel>>({
    path: brandMetadataEndpoint(brandId),
    method: 'PUT',
    body,
  });
  return response.data.data;
}
