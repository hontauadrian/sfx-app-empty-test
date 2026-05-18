import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontsEntryEndpoint } from '../../constants';
import type { DosDontsEntryDataModel } from '../model/dos-donts-entry-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpdateDosDontsEntryInput {
  readonly brandId: string;
  readonly entryId: string;
  readonly type?: 'do' | 'dont';
  readonly category?: string;
  readonly ruleText?: string;
  readonly exampleText?: string | null;
}

export async function updateDosDontsEntry(
  input: UpdateDosDontsEntryInput,
): Promise<DosDontsEntryDataModel> {
  const { brandId, entryId, ...body } = input;
  const response = await executeRequest<ApiEnvelope<DosDontsEntryDataModel>>({
    path: dosAndDontsEntryEndpoint(brandId, entryId),
    method: 'PATCH',
    body,
  });
  return response.data.data;
}
