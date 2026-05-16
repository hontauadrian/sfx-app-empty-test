import { executeRequest } from '@/features/presentation/networking';
import type { BrandVoiceWriteInput } from '@sfx/validation';
import { brandVoiceEndpoint } from '../../constants';
import type { BrandVoiceDataModel } from '../model/brand-voice-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpsertBrandVoiceInput {
  readonly brandId: string;
  readonly payload: BrandVoiceWriteInput;
}

export async function upsertBrandVoice(
  input: UpsertBrandVoiceInput,
): Promise<BrandVoiceDataModel> {
  const response = await executeRequest<ApiEnvelope<BrandVoiceDataModel>>({
    path: brandVoiceEndpoint(input.brandId),
    method: 'PUT',
    body: input.payload,
  });
  return response.data.data;
}
