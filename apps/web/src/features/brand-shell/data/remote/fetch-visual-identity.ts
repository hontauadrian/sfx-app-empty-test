import { executeRequest } from '@/features/presentation/networking';
import { visualIdentityEndpoint } from '../../constants';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchVisualIdentity(
  brandId: string,
): Promise<VisualIdentityDataModel | null> {
  const response = await executeRequest<ApiEnvelope<VisualIdentityDataModel | null>>({
    path: visualIdentityEndpoint(brandId),
  });
  return response.data.data;
}
