import { executeRequest } from '@/features/presentation/networking';
import { dosAndDontsEntryEndpoint } from '../../constants';

export interface DeleteDosDontsEntryInput {
  readonly brandId: string;
  readonly entryId: string;
}

export async function deleteDosDontsEntry(input: DeleteDosDontsEntryInput): Promise<void> {
  await executeRequest<void>({
    path: dosAndDontsEntryEndpoint(input.brandId, input.entryId),
    method: 'DELETE',
  });
}
