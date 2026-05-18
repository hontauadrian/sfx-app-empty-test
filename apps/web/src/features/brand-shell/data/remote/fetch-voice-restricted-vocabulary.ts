import { executeRequest } from '@/features/presentation/networking';
import { voiceRestrictedVocabularyEndpoint } from '../../constants';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchVoiceRestrictedVocabulary(
  brandId: string,
): Promise<readonly string[]> {
  const response = await executeRequest<ApiEnvelope<readonly string[]>>({
    path: voiceRestrictedVocabularyEndpoint(brandId),
  });
  return response.data.data;
}
