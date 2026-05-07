'use client';

import type { ReactNode } from 'react';
import { useAuthGate } from './use-auth-gate';
import type { AuthGateProps } from './types';

export function AuthGate({ children }: AuthGateProps): ReactNode {
  const { uiModel } = useAuthGate();

  if (uiModel.shouldRenderChildren) {
    return children;
  }

  if (uiModel.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <section
          aria-label={uiModel.title}
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
      </section>
    </main>
  );
}
