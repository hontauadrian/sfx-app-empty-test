import type { HealthDataModel } from '../model/health-data-model';

export interface HealthStatus {
  readonly isHealthy: boolean;
  readonly databaseConnected: boolean;
  readonly checkedAt: Date;
}

export function mapToHealth(data: HealthDataModel): HealthStatus {
  return {
    isHealthy: data.status === 'ok',
    databaseConnected: data.database === 'connected',
    checkedAt: new Date(data.timestamp),
  };
}
