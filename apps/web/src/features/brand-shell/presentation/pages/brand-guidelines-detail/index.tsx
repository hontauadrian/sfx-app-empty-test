'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandProfileSelector } from '../../components/BrandProfileSelector';
import { BrandGuidelinesSubNav } from '../../components/BrandGuidelinesSubNav';
import { SearchBar } from '../../components/SearchBar';
import { SearchResultsContainer } from '../../components/SearchResultsContainer';
import { useBrandGuidelinesDetail } from './use-brand-guidelines-detail';
import { useBrandGuidelinesDetailNavigationHandler } from './use-brand-guidelines-detail-navigation-handler';
import type { BrandGuidelinesDetailPageProps } from './types';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export function BrandGuidelinesDetailPage(
  props: BrandGuidelinesDetailPageProps,
): ReactNode {
  const {
    uiModel,
    brands,
    navigationTarget,
    clearNavigationTarget,
    handleSelectBrand,
    handleCreated,
    handleRenamed,
    handleDeleted,
    searchQuery,
    setSearchQuery,
  } = useBrandGuidelinesDetail(props);

  useBrandGuidelinesDetailNavigationHandler(navigationTarget, clearNavigationTarget);

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

  if (uiModel.status === 'not-found') {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <h1 className="mb-6 text-3xl font-bold text-foreground">{uiModel.pageTitle}</h1>
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="text-2xl font-semibold text-foreground">{uiModel.notFound.title}</h2>
          <p className="mt-3 text-muted-foreground">{uiModel.notFound.message}</p>
          <Link
            href={uiModel.notFound.backHref}
            className="mt-5 inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted"
          >
            {uiModel.notFound.backLabel}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">{uiModel.pageTitle}</h1>
      <BrandProfileSelector
        brands={brands}
        activeBrandId={props.brandId}
        onSelectBrand={handleSelectBrand}
        onCreated={handleCreated}
        onRenamed={handleRenamed}
        onDeleted={handleDeleted}
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <Link
          href={`/admin/brand-guidelines/${props.brandId}/audit-log`}
          data-testid="brand-guidelines-audit-log-link"
          className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {uiModel.auditLogCtaLabel}
        </Link>
      </div>
      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      <SearchResultsContainer brandId={props.brandId} query={searchQuery} />
      <BrandGuidelinesSubNav activeBrandId={props.brandId} />
    </main>
  );
}
