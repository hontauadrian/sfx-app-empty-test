import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontsEndpoint } from '../../constants';
import type { DosDontsEntryDataModel } from '../model/dos-donts-entry-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchDosAndDontsParams {
  readonly brandId: string;
  readonly type?: 'do' | 'dont';
  readonly category?: string;
}

export async function fetchDosAndDonts(
  params: FetchDosAndDontsParams,
): Promise<readonly DosDontsEntryDataModel[]> {
  const query = new URLSearchParams();
  if (params.type) query.set('type', params.type);
  if (params.category) query.set('category', params.category);
  const queryString = query.toString();
  const path = `${dosAndDontsEndpoint(params.brandId)}${queryString ? `?${queryString}` : ''}`;
  const response = await executeRequest<
    ApiEnvelope<{ items: readonly DosDontsEntryDataModel[] }>
  >({ path });
  return response.data.data.items;
}
