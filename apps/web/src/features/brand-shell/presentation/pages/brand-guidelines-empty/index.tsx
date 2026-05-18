'use client';

import type { ReactNode } from 'react';
import type { Brand } from '@sfx/domain';
import { CreateBrandModal } from '../../components/CreateBrandModal';
import { useBrandGuidelinesEmpty } from './use-brand-guidelines-empty';
import { useBrandGuidelinesEmptyNavigationHandler } from './use-brand-guidelines-empty-navigation-handler';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export function BrandGuidelinesEmptyPage(): ReactNode {
  const {
    uiModel,
    createOpen,
    navigationTarget,
    clearNavigationTarget,
    handleOpenCreate,
    handleCloseCreate,
    handleCreated,
  } = useBrandGuidelinesEmpty();

  useBrandGuidelinesEmptyNavigationHandler(navigationTarget, clearNavigationTarget);

  if (uiModel.status === 'loading') {
    return (
      <main
        aria-busy="true"
        aria-label={uiModel.pageTitle}
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8"
      >
        <div className="h-8 w-1/2 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">{uiModel.pageTitle}</h1>
      <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-12 text-center">
        <h2 className="text-2xl font-semibold text-foreground">{uiModel.emptyTitle}</h2>
        <p className="text-muted-foreground">{uiModel.emptyMessage}</p>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="min-h-11 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          {uiModel.createCtaLabel}
        </button>
      </section>
      <CreateBrandModal
        open={createOpen}
        onClose={handleCloseCreate}
        onCreated={(brand: Brand) => handleCreated(brand.id)}
      />
    </main>
  );
}
