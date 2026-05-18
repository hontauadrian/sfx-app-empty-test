'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useCompanyInfoHistory } from './use-company-info-history';
import type {
  CompanyInfoHistoryPageUIModel,
  CompanyInfoHistoryRowUIModel,
} from './types';
import type { CompanyInfoDeniedUIModel } from '../company-info/types';

interface SkeletonProps {
  readonly title: string;
  readonly loadingLabel: string;
}

function HistorySkeleton({ title, loadingLabel }: SkeletonProps): ReactNode {
  return (
    <main
      aria-busy="true"
      aria-label={loadingLabel}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8"
    >
      <div className="h-8 w-1/2 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <span className="sr-only">{title}</span>
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
    </main>
  );
}

interface DeniedSurfaceProps {
  readonly uiModel: CompanyInfoDeniedUIModel;
}

function DeniedSurface({ uiModel }: DeniedSurfaceProps): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <section className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
        <p className="mt-3 text-muted-foreground">{uiModel.message}</p>
        <a
          className="mt-5 inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={uiModel.backToHomeHref}
        >
          {uiModel.backToHomeLabel}
        </a>
      </section>
    </main>
  );
}

interface HistoryRowProps {
  readonly row: CompanyInfoHistoryRowUIModel;
  readonly editorHeader: string;
  readonly savedAtHeader: string;
}

function HistoryRow({ row, editorHeader, savedAtHeader }: HistoryRowProps): ReactNode {
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted">
      <td className="px-4 py-3 align-middle">
        <Link
          href={row.href}
          aria-label={row.ariaLabel}
          className="block min-h-11 text-foreground underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="sr-only">{savedAtHeader}: </span>
          {row.savedAtLabel}
        </Link>
      </td>
      <td className="px-4 py-3 align-middle text-foreground">
        <span className="sr-only">{editorHeader}: </span>
        {row.editorLabel}
      </td>
    </tr>
  );
}

interface HeaderAndBackProps {
  readonly uiModel: CompanyInfoHistoryPageUIModel;
}

function HeaderAndBack({ uiModel }: HeaderAndBackProps): ReactNode {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-3xl font-bold text-foreground">{uiModel.title}</h1>
      <Link
        href={uiModel.backToCurrent.href}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {uiModel.backToCurrent.label}
      </Link>
    </div>
  );
}

export function CompanyInfoHistoryPage(): ReactNode {
  const { uiModel } = useCompanyInfoHistory();

  if (uiModel.status === 'loading') {
    return <HistorySkeleton title={uiModel.title} loadingLabel={uiModel.loadingLabel} />;
  }

  if (uiModel.status === 'denied') {
    return <DeniedSurface uiModel={uiModel.denied} />;
  }

  if (uiModel.status === 'error') {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <HeaderAndBack uiModel={uiModel} />
        <section
          role="alert"
          className="rounded-md border border-destructive bg-card p-6 text-center"
        >
          <h2 className="text-xl font-semibold text-foreground">{uiModel.error.title}</h2>
          <p className="mt-2 text-muted-foreground">{uiModel.error.message}</p>
        </section>
      </main>
    );
  }

  if (uiModel.status === 'empty') {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <HeaderAndBack uiModel={uiModel} />
        <section className="rounded-md border border-border bg-card p-6 text-center">
          <h2 className="text-xl font-semibold text-foreground">{uiModel.empty.title}</h2>
          <p className="mt-2 text-muted-foreground">{uiModel.empty.message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <HeaderAndBack uiModel={uiModel} />
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-left">
          <thead className="bg-muted text-sm uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.savedAt}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {uiModel.columnHeaders.editor}
              </th>
            </tr>
          </thead>
          <tbody>
            {uiModel.rows.map((row) => (
              <HistoryRow
                key={row.id}
                row={row}
                editorHeader={uiModel.columnHeaders.editor}
                savedAtHeader={uiModel.columnHeaders.savedAt}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
