import type { UpsertVisualIdentityInput } from '@sfx/domain';
import { executeRequest } from '@/features/presentation/networking';
import { visualIdentityEndpoint } from '../../constants';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function updateVisualIdentity(
  brandId: string,
  input: UpsertVisualIdentityInput,
): Promise<VisualIdentityDataModel> {
  const response = await executeRequest<ApiEnvelope<VisualIdentityDataModel>>({
    path: visualIdentityEndpoint(brandId),
    method: 'PUT',
    body: input,
  });
  return response.data.data;
}
