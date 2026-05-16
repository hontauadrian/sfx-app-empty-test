import { executeRequest } from '@/features/presentation/networking';
import type { VisualIdentityWriteInput } from '@sfx/validation';
import { visualIdentityEndpoint } from '../../constants';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface UpsertVisualIdentityInput {
  readonly brandId: string;
  readonly payload: VisualIdentityWriteInput;
}

export async function upsertVisualIdentity(
  input: UpsertVisualIdentityInput,
): Promise<VisualIdentityDataModel> {
  const response = await executeRequest<ApiEnvelope<VisualIdentityDataModel>>({
    path: visualIdentityEndpoint(input.brandId),
    method: 'PUT',
    body: input.payload,
  });
  return response.data.data;
}
