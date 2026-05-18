import { executeRequest } from '@/features/presentation/networking';
import { voiceRejectedExamplesEndpoint } from '../../constants';
import type { BrandVoiceRejectedExampleDataModel } from '../model/brand-voice-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchVoiceRejectedExamples(
  brandId: string,
): Promise<readonly BrandVoiceRejectedExampleDataModel[]> {
  const response = await executeRequest<
    ApiEnvelope<readonly BrandVoiceRejectedExampleDataModel[]>
  >({ path: voiceRejectedExamplesEndpoint(brandId) });
  return response.data.data;
}
