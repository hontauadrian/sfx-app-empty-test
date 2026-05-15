'use client';

import type { ReactNode } from 'react';
import { useDashboard } from './use-dashboard';

export function DashboardPage(): ReactNode {
  const { uiModel } = useDashboard();

  if (uiModel.isLoading) {
    return (
      <section className="p-8" aria-busy="true">
        <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  if (uiModel.hasError) {
    return (
      <section className="p-8">
        <p className="text-destructive">{uiModel.errorLabel}</p>
      </section>
    );
  }

  if (uiModel.showEmptyState) {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.emptyStateTitle}</h1>
        <p className="text-muted-foreground">{uiModel.emptyStateBody}</p>
        <a
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
          href={uiModel.emptyStateCtaHref}
        >
          {uiModel.emptyStateCtaLabel}
        </a>
      </section>
    );
  }

  return (
    <section className="p-8" aria-busy="true">
      <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted" />
    </section>
  );
}
