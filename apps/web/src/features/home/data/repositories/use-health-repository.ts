import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HEALTH_QUERY_KEY } from '../../constants';
import { fetchHealth } from '../remote/fetch-health';
import { mapToHealth, type HealthStatus } from '../mapper/map-to-health';
import type { HealthDataModel } from '../model/health-data-model';

export function useHealthRepository(): UseQueryResult<HealthStatus> {
  return useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: fetchHealth,
    select: (data: HealthDataModel) => mapToHealth(data),
    refetchInterval: 30000,
  });
}
