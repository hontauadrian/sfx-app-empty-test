import { executeRequest } from '@/features/presentation/networking';
import { guidelineSearchEndpoint } from '../../constants';
import type { GuidelineSearchResponseDataModel } from '../model/guideline-search-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchGuidelineSearchInput {
  readonly brandId: string;
  readonly query: string;
}

export async function fetchGuidelineSearch(
  input: FetchGuidelineSearchInput,
): Promise<GuidelineSearchResponseDataModel> {
  const queryString = input.query ? `?q=${encodeURIComponent(input.query)}` : '';
  const response = await executeRequest<ApiEnvelope<GuidelineSearchResponseDataModel>>({
    path: `${guidelineSearchEndpoint(input.brandId)}${queryString}`,
  });
  return response.data.data;
}
