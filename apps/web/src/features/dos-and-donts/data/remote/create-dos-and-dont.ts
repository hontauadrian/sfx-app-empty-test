import { executeRequest } from '@/features/presentation/networking';
import type { DosAndDontWriteInput } from '@sfx/validation';
import { dosAndDontsEndpoint } from '../../constants';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface CreateDosAndDontInput {
  readonly brandId: string;
  readonly payload: DosAndDontWriteInput;
}

export async function createDosAndDont(
  input: CreateDosAndDontInput,
): Promise<DosAndDontDataModel> {
  const response = await executeRequest<ApiEnvelope<DosAndDontDataModel>>({
    path: dosAndDontsEndpoint(input.brandId),
    method: 'POST',
    body: input.payload,
  });
  return response.data.data;
}
