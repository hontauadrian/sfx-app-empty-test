'use client';

import type { ReactNode } from 'react';
import { useAdminRouteGate } from './use-admin-route-gate';
import type { AdminRouteGateProps } from './types';

export function AdminRouteGate({ children }: AdminRouteGateProps): ReactNode {
  const { uiModel } = useAdminRouteGate();

  if (uiModel.status === 'allowed') {
    return children;
  }

  if (uiModel.status === 'loading') {
    return (
      <main
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-background p-8"
      >
        <section
          aria-hidden="true"
          className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted"
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <section className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
        <p className="mt-3 text-muted-foreground">{uiModel.message}</p>
        <a
          className="mt-5 inline-flex items-center rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={uiModel.backToHomeHref}
        >
          {uiModel.backToHomeLabel}
        </a>
      </section>
    </main>
  );
}
