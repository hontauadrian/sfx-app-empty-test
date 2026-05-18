import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontsEndpoint } from '../../constants';
import type { DosDontsEntryDataModel } from '../model/dos-donts-entry-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface CreateDosDontsEntryInput {
  readonly brandId: string;
  readonly type: 'do' | 'dont';
  readonly category: string;
  readonly ruleText: string;
  readonly exampleText?: string | null;
}

export async function createDosDontsEntry(
  input: CreateDosDontsEntryInput,
): Promise<DosDontsEntryDataModel> {
  const { brandId, ...body } = input;
  const response = await executeRequest<ApiEnvelope<DosDontsEntryDataModel>>({
    path: dosAndDontsEndpoint(brandId),
    method: 'POST',
    body,
  });
  return response.data.data;
}
