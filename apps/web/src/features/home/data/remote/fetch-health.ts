import { executeRequest } from '@/features/presentation/networking';
import { HEALTH_ENDPOINT } from '../../constants';
import type { HealthDataModel } from '../model/health-data-model';

interface ApiEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export async function fetchHealth(): Promise<HealthDataModel> {
  const response = await executeRequest<ApiEnvelope<HealthDataModel>>({ path: HEALTH_ENDPOINT });
  return response.data.data;
}
