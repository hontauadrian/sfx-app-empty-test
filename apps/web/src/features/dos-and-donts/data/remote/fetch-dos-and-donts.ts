import { executeRequest } from '@/features/presentation/networking';
import type { DosAndDontCategory } from '@sfx/validation';
import { dosAndDontsEndpoint } from '../../constants';
import type { DosAndDontDataModel } from '../model/dos-and-dont-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface FetchDosAndDontsInput {
  readonly brandId: string;
  readonly category?: DosAndDontCategory;
}

export async function fetchDosAndDonts(
  input: FetchDosAndDontsInput,
): Promise<DosAndDontDataModel[]> {
  const base = dosAndDontsEndpoint(input.brandId);
  const path = input.category ? `${base}?category=${encodeURIComponent(input.category)}` : base;
  const response = await executeRequest<ApiEnvelope<DosAndDontDataModel[]>>({
    path,
  });
  return response.data.data;
}
