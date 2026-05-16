'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useContentCheck } from './use-content-check';
import { ContentCheckResultList } from '../../components/ContentCheckResultList';

export function ContentCheckPage(): ReactNode {
  const { uiModel, register, handleSubmit, handleCheckContent } = useContentCheck();

  const onSubmit = handleSubmit(handleCheckContent);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{uiModel.pageTitle}</h1>
        {uiModel.activeBrandName !== null ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {uiModel.activeBrandLabel}:
            </span>{' '}
            {uiModel.activeBrandName}
          </p>
        ) : null}
      </header>

      {uiModel.state === 'noActiveBrand' ||
      uiModel.state === 'brandNotFound' ? (
        <section
          aria-label={uiModel.emptyStateTitle ?? uiModel.pageTitle}
          className="rounded-md border border-border bg-card p-6 text-center"
        >
          <h2 className="text-lg font-semibold text-foreground">
            {uiModel.emptyStateTitle}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {uiModel.emptyStateBody}
          </p>
          {uiModel.emptyStateCtaHref !== null &&
          uiModel.emptyStateCtaLabel !== null ? (
            <Link
              href={uiModel.emptyStateCtaHref}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {uiModel.emptyStateCtaLabel}
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-md border border-border bg-card p-4"
            aria-label={uiModel.pageTitle}
          >
            <label className="block text-sm text-foreground">
              <span>{uiModel.pastedTextLabel}</span>
              <textarea
                {...register('pastedText')}
                maxLength={uiModel.pastedTextMaxLength}
                placeholder={uiModel.pastedTextPlaceholder}
                className="mt-1 h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </label>
            <label className="block text-sm text-foreground">
              <span>{uiModel.categoryLabel}</span>
              <select
                {...register('category')}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              >
                {uiModel.categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {uiModel.submitLabel}
            </button>
          </form>

          {uiModel.pastedTextValue.length > 0 ? (
            <section
              aria-label={uiModel.referenceTextLabel}
              className="rounded-md border border-border bg-background p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {uiModel.referenceTextLabel}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {uiModel.pastedTextValue}
              </p>
            </section>
          ) : null}

          {uiModel.state === 'loading' ? (
            <div
              aria-label={uiModel.resultsTitle}
              className="space-y-3 rounded-md border border-border bg-card p-4"
            >
              <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : null}

          {uiModel.state === 'error' ? (
            <div
              role="alert"
              className="rounded-md border border-destructive bg-card p-4 text-sm text-destructive"
            >
              {uiModel.errorMessage}
            </div>
          ) : null}

          {uiModel.state === 'zeroMatches' ? (
            <section
              aria-label={uiModel.emptyStateTitle ?? uiModel.resultsTitle}
              className="rounded-md border border-border bg-card p-6 text-center"
            >
              <h2 className="text-lg font-semibold text-foreground">
                {uiModel.emptyStateTitle}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {uiModel.emptyStateBody}
              </p>
              {uiModel.emptyStateCtaHref !== null &&
              uiModel.emptyStateCtaLabel !== null ? (
                <Link
                  href={uiModel.emptyStateCtaHref}
                  className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {uiModel.emptyStateCtaLabel}
                </Link>
              ) : null}
            </section>
          ) : null}

          {uiModel.state === 'populated' ? (
            <ContentCheckResultList
              resultsTitle={uiModel.resultsTitle}
              suggestedCorrectionLabel={uiModel.suggestedCorrectionLabel}
              groups={uiModel.groups}
            />
          ) : null}
        </>
      )}
    </main>
  );
}
