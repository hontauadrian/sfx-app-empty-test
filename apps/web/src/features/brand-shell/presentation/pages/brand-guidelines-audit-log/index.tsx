'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useBrandGuidelinesAuditLog } from './use-brand-guidelines-audit-log';
import type { BrandGuidelinesAuditLogPageProps } from './types';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export function BrandGuidelinesAuditLogPage(
  props: BrandGuidelinesAuditLogPageProps,
): ReactNode {
  const { uiModel, draft, setDraftField, applyFilters, clearFilters } =
    useBrandGuidelinesAuditLog(props.brandId);

  return (
    <main
      data-testid="brand-guidelines-audit-log-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{uiModel.subtitle}</p>
        </div>
        <Link
          href={uiModel.backToCurrent.href}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          data-testid="brand-guidelines-audit-log-back-link"
        >
          {uiModel.backToCurrent.label}
        </Link>
      </header>

      <section
        aria-label={uiModel.filters.clientIdLabel}
        className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
      >
        <label className="flex flex-col text-sm text-muted-foreground">
          <span>{uiModel.filters.clientIdLabel}</span>
          <input
            type="text"
            data-testid="audit-log-filter-client-id"
            value={draft.clientId}
            placeholder={uiModel.filters.clientIdPlaceholder}
            onChange={(event) => setDraftField('clientId', event.target.value)}
            className="mt-1 min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="flex flex-col text-sm text-muted-foreground">
          <span>{uiModel.filters.fromLabel}</span>
          <input
            type="datetime-local"
            data-testid="audit-log-filter-from"
            value={draft.from}
            onChange={(event) => setDraftField('from', event.target.value)}
            className="mt-1 min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="flex flex-col text-sm text-muted-foreground">
          <span>{uiModel.filters.toLabel}</span>
          <input
            type="datetime-local"
            data-testid="audit-log-filter-to"
            value={draft.to}
            onChange={(event) => setDraftField('to', event.target.value)}
            className="mt-1 min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="audit-log-filter-apply"
            onClick={applyFilters}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {uiModel.filters.applyCta}
          </button>
          <button
            type="button"
            data-testid="audit-log-filter-clear"
            onClick={clearFilters}
            className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {uiModel.filters.clearCta}
          </button>
        </div>
      </section>

      {uiModel.status === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
        >
          {uiModel.loadingLabel}
        </div>
      )}

      {uiModel.status === 'empty' && (
        <section
          data-testid="brand-guidelines-audit-log-empty"
          className="rounded-md border border-border bg-card p-8 text-center"
        >
          <h2 className="text-lg font-semibold text-foreground">{uiModel.empty.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{uiModel.empty.message}</p>
        </section>
      )}

      {uiModel.status === 'denied' && (
        <section
          role="alert"
          data-testid="brand-guidelines-audit-log-denied"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.denied.title}</h2>
          <p className="mt-2 text-sm">{uiModel.denied.message}</p>
        </section>
      )}

      {uiModel.status === 'not-found' && (
        <section
          role="alert"
          data-testid="brand-guidelines-audit-log-not-found"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.notFound.title}</h2>
          <p className="mt-2 text-sm">{uiModel.notFound.message}</p>
        </section>
      )}

      {uiModel.status === 'error' && (
        <section
          role="alert"
          data-testid="brand-guidelines-audit-log-error"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.error.title}</h2>
          <p className="mt-2 text-sm">{uiModel.error.message}</p>
        </section>
      )}

      {uiModel.status === 'ready' && (
        <table
          data-testid="brand-guidelines-audit-log-table"
          className="w-full border-collapse text-left text-sm"
        >
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.clientId}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.endpoint}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.versionId}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.status}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.requestTimestamp}
              </th>
            </tr>
          </thead>
          <tbody>
            {uiModel.rows.map((row) => (
              <tr
                key={row.id}
                data-testid={`brand-guidelines-audit-log-row-${row.id}`}
                aria-label={row.ariaLabel}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 text-foreground">{row.clientIdLabel}</td>
                <td className="px-4 py-3 text-foreground">{row.endpointLabel}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.versionIdLabel}</td>
                <td className="px-4 py-3 text-foreground">{row.statusLabel}</td>
                <td className="px-4 py-3 text-foreground">{row.timestampLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
