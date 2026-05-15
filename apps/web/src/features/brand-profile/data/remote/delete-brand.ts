import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function deleteBrand(id: string): Promise<void> {
  await executeRequest<ApiEnvelope<null>>({
    path: `${BRANDS_ENDPOINT}/${id}`,
    method: 'DELETE',
  });
}
