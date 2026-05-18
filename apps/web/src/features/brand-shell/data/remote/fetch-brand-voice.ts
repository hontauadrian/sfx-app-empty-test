import { executeRequest } from '@/features/presentation/networking';
import { brandVoiceEndpoint } from '../../constants';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchBrandVoice(
  brandId: string,
): Promise<BrandVoiceDataModel | null> {
  const response = await executeRequest<ApiEnvelope<BrandVoiceDataModel | null>>({
    path: brandVoiceEndpoint(brandId),
  });
  return response.data.data;
}
