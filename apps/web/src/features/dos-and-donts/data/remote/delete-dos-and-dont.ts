import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontEntryEndpoint } from '../../constants';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface DeleteDosAndDontInput {
  readonly brandId: string;
  readonly entryId: string;
}

export async function deleteDosAndDont(input: DeleteDosAndDontInput): Promise<void> {
  await executeRequest<ApiEnvelope<null>>({
    path: dosAndDontEntryEndpoint(input.brandId, input.entryId),
    method: 'DELETE',
  });
}
