'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useBrandGuidelinesHistory } from './use-brand-guidelines-history';
import type { BrandGuidelinesHistoryPageProps } from './types';

export function BrandGuidelinesHistoryPage(
  props: BrandGuidelinesHistoryPageProps,
): ReactNode {
  const { uiModel } = useBrandGuidelinesHistory(props.brandId);

  return (
    <main
      data-testid="brand-guidelines-history-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6"
    >
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
        <Link
          href={uiModel.backToCurrent.href}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="brand-guidelines-history-back-link"
        >
          {uiModel.backToCurrent.label}
        </Link>
      </header>

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
          data-testid="brand-guidelines-history-empty"
          className="rounded-md border border-border bg-card p-8 text-center"
        >
          <h2 className="text-lg font-semibold text-foreground">{uiModel.empty.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{uiModel.empty.message}</p>
        </section>
      )}

      {uiModel.status === 'denied' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-denied"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.denied.title}</h2>
          <p className="mt-2 text-sm">{uiModel.denied.message}</p>
        </section>
      )}

      {uiModel.status === 'not-found' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-not-found"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.notFound.title}</h2>
          <p className="mt-2 text-sm">{uiModel.notFound.message}</p>
        </section>
      )}

      {uiModel.status === 'error' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-error"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.error.title}</h2>
          <p className="mt-2 text-sm">{uiModel.error.message}</p>
        </section>
      )}

      {uiModel.status === 'ready' && (
        <table
          data-testid="brand-guidelines-history-table"
          className="w-full border-collapse text-left text-sm"
        >
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.savedAt}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.editor}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.changeNote}
              </th>
            </tr>
          </thead>
          <tbody>
            {uiModel.rows.map((row) => (
              <tr
                key={row.id}
                data-testid={`brand-guidelines-history-row-${row.id}`}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <Link
                    href={row.href}
                    aria-label={row.ariaLabel}
                    className="text-foreground hover:underline"
                  >
                    {row.savedAtLabel}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{row.editorLabel}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.changeNoteLabel ?? uiModel.emptyChangeNote}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
