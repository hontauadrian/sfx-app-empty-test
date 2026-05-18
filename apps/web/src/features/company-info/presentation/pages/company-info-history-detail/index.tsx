'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useCompanyInfoHistoryDetail } from './use-company-info-history-detail';
import type {
  CompanyInfoHistoryDetailFieldUIModel,
  CompanyInfoHistoryDetailPageUIModel,
  CompanyInfoHistoryDetailSectionUIModel,
} from './types';
import type { CompanyInfoDeniedUIModel } from '../company-info/types';

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

interface SkeletonProps {
  readonly title: string;
}

function DetailSkeleton({ title }: SkeletonProps): ReactNode {
  return (
    <main aria-busy="true" aria-label={title} className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <div className="h-8 w-1/2 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
    </main>
  );
}

interface FieldShellProps {
  readonly field: CompanyInfoHistoryDetailFieldUIModel;
  readonly inputId: string;
  readonly readOnlyAriaSuffix: string;
  readonly children: ReactNode;
}

function FieldShell({ field, inputId, readOnlyAriaSuffix, children }: FieldShellProps): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {field.label}
        <span className="sr-only">{readOnlyAriaSuffix}</span>
      </label>
      {children}
    </div>
  );
}

interface FieldRendererProps {
  readonly field: CompanyInfoHistoryDetailFieldUIModel;
  readonly readOnlyAriaSuffix: string;
}

function FieldRenderer({ field, readOnlyAriaSuffix }: FieldRendererProps): ReactNode {
  const inputId = `company-info-history-${field.name}`;
  const baseClass =
    'rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground cursor-not-allowed opacity-90';

  if (field.value.kind === 'array') {
    if (field.value.items.length === 0) {
      return (
        <FieldShell field={field} inputId={inputId} readOnlyAriaSuffix={readOnlyAriaSuffix}>
          <input
            id={inputId}
            type="text"
            value={field.value.emptyText}
            disabled
            readOnly
            aria-disabled="true"
            className={baseClass}
          />
        </FieldShell>
      );
    }
    return (
      <FieldShell field={field} inputId={inputId} readOnlyAriaSuffix={readOnlyAriaSuffix}>
        <ul
          id={inputId}
          aria-disabled="true"
          className="flex flex-col gap-2"
        >
          {field.value.items.map((entry, index) => {
            const itemId = `${inputId}-${index}`;
            return (
              <li key={`${field.name}-${index}`} className="flex flex-col gap-1">
                <input
                  id={itemId}
                  type="text"
                  value={entry}
                  disabled
                  readOnly
                  aria-disabled="true"
                  aria-label={`${field.label} ${index + 1}${readOnlyAriaSuffix}`}
                  className={baseClass}
                />
              </li>
            );
          })}
        </ul>
      </FieldShell>
    );
  }

  if (field.value.kind === 'multiline') {
    return (
      <FieldShell field={field} inputId={inputId} readOnlyAriaSuffix={readOnlyAriaSuffix}>
        <textarea
          id={inputId}
          rows={4}
          value={field.value.text}
          disabled
          readOnly
          aria-disabled="true"
          className={baseClass}
        />
      </FieldShell>
    );
  }

  const inputType =
    field.type === 'email' || field.type === 'tel' || field.type === 'url' || field.type === 'number'
      ? field.type
      : 'text';
  return (
    <FieldShell field={field} inputId={inputId} readOnlyAriaSuffix={readOnlyAriaSuffix}>
      <input
        id={inputId}
        type={inputType}
        value={field.value.text}
        disabled
        readOnly
        aria-disabled="true"
        className={baseClass}
      />
    </FieldShell>
  );
}

interface SectionProps {
  readonly section: CompanyInfoHistoryDetailSectionUIModel;
  readonly readOnlyAriaSuffix: string;
}

function Section({ section, readOnlyAriaSuffix }: SectionProps): ReactNode {
  return (
    <fieldset className="space-y-3 rounded-md border border-border bg-card p-4">
      <legend className="px-1 text-xl font-semibold text-foreground">{section.title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <FieldRenderer key={field.name} field={field} readOnlyAriaSuffix={readOnlyAriaSuffix} />
        ))}
      </div>
    </fieldset>
  );
}

interface HeaderProps {
  readonly uiModel: CompanyInfoHistoryDetailPageUIModel;
}

function HeaderAndBack({ uiModel }: HeaderProps): ReactNode {
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

export interface CompanyInfoHistoryDetailPageProps {
  readonly versionId: string;
}

export function CompanyInfoHistoryDetailPage({
  versionId,
}: CompanyInfoHistoryDetailPageProps): ReactNode {
  const { uiModel } = useCompanyInfoHistoryDetail({ versionId });

  if (uiModel.status === 'loading') {
    return <DetailSkeleton title={uiModel.title} />;
  }

  if (uiModel.status === 'denied') {
    return <DeniedSurface uiModel={uiModel.denied} />;
  }

  if (uiModel.status === 'not-found') {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <HeaderAndBack uiModel={uiModel} />
        <section className="rounded-md border border-border bg-card p-6 text-center">
          <h2 className="text-xl font-semibold text-foreground">{uiModel.notFound.title}</h2>
          <p className="mt-2 text-muted-foreground">{uiModel.notFound.message}</p>
        </section>
      </main>
    );
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

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <HeaderAndBack uiModel={uiModel} />
      <div
        role="status"
        aria-live="polite"
        className="mb-6 rounded-md border border-border bg-muted/60 p-4 text-foreground"
      >
        {uiModel.banner.message}
      </div>
      <div className="space-y-8">
        {uiModel.sections.map((section) => (
          <Section
            key={section.key}
            section={section}
            readOnlyAriaSuffix={uiModel.readOnlyAriaSuffix}
          />
        ))}
      </div>
    </main>
  );
}
