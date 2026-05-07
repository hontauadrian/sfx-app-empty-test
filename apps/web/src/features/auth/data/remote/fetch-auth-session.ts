import { executeRequest } from '@/features/presentation/networking';
import { AUTH_ME_ENDPOINT } from '../../constants';
import type { AuthSessionDataModel } from '../model/auth-session-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchAuthSession(): Promise<AuthSessionDataModel> {
  const response = await executeRequest<ApiEnvelope<AuthSessionDataModel>>({
    path: AUTH_ME_ENDPOINT,
  });
  return response.data.data;
}
