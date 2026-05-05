'use client';

import type { ReactNode } from 'react';
import { useHome } from './use-home';
import { HealthStatus } from '../../components/HealthStatus';

export function HomePage(): ReactNode {
  const { uiModel } = useHome();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <h1 className="mb-8 text-4xl font-bold text-foreground">{uiModel.title}</h1>
      <HealthStatus
        label={uiModel.healthLabel}
        statusText={uiModel.statusText}
        isHealthy={uiModel.isHealthy}
        isLoading={uiModel.isLoading}
      />
      <a
        className="mt-8 inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        href={uiModel.ctaHref}
      >
        {uiModel.ctaLabel}
      </a>
    </main>
  );
}
