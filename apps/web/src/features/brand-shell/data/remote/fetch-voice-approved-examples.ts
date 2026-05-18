import { executeRequest } from '@/features/presentation/networking';
import { voiceApprovedExamplesEndpoint } from '../../constants';
import type { BrandVoiceApprovedExampleDataModel } from '../model/brand-voice-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchVoiceApprovedExamples(
  brandId: string,
): Promise<readonly BrandVoiceApprovedExampleDataModel[]> {
  const response = await executeRequest<
    ApiEnvelope<readonly BrandVoiceApprovedExampleDataModel[]>
  >({ path: voiceApprovedExamplesEndpoint(brandId) });
  return response.data.data;
}
