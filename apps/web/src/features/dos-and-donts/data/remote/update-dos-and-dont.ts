import { executeRequest } from '@/features/presentation/networking';
import type { DosAndDontWriteInput } from '@sfx/validation';
import { dosAndDontEntryEndpoint } from '../../constants';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpdateDosAndDontInput {
  readonly brandId: string;
  readonly entryId: string;
  readonly payload: DosAndDontWriteInput;
}

export async function updateDosAndDont(
  input: UpdateDosAndDontInput,
): Promise<DosAndDontDataModel> {
  const response = await executeRequest<ApiEnvelope<DosAndDontDataModel>>({
    path: dosAndDontEntryEndpoint(input.brandId, input.entryId),
    method: 'PUT',
    body: input.payload,
  });
  return response.data.data;
}
