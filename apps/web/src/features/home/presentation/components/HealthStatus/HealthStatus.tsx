import type { ReactNode } from 'react';
import type { HealthStatusProps } from './types';

export function HealthStatus({
  label,
  statusText,
  isHealthy,
  isLoading,
}: HealthStatusProps): ReactNode {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${isHealthy ? 'text-green-500' : 'text-destructive'}`}>
        {statusText}
      </p>
    </div>
  );
}
