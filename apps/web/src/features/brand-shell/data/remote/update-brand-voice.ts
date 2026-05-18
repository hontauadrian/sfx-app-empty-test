import type { UpsertBrandVoiceInput } from '@sfx/domain';
import { executeRequest } from '@/features/presentation/networking';
import { brandVoiceEndpoint } from '../../constants';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function updateBrandVoice(
  brandId: string,
  input: UpsertBrandVoiceInput,
): Promise<BrandVoiceDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandVoiceDataModel>>({
    path: brandVoiceEndpoint(brandId),
    method: 'PUT',
    body: input,
  });
  return response.data.data;
}
