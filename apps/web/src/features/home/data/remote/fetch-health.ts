import { executeRequest } from '@/features/presentation/networking';
import { HEALTH_ENDPOINT } from '../../constants';
import type { HealthDataModel } from '../model/health-data-model';

export async function fetchHealth(): Promise<HealthDataModel> {
  const response = await executeRequest<HealthDataModel>({ path: HEALTH_ENDPOINT });
  return response.data;
}
