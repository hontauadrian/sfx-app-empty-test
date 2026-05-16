import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontEntryEndpoint } from '../../constants';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchDosAndDontByIdInput {
  readonly brandId: string;
  readonly entryId: string;
}

export async function fetchDosAndDontById(
  input: FetchDosAndDontByIdInput,
): Promise<DosAndDontDataModel> {
  const response = await executeRequest<ApiEnvelope<DosAndDontDataModel>>({
    path: dosAndDontEntryEndpoint(input.brandId, input.entryId),
  });
  return response.data.data;
}
