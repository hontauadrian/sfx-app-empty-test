'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BrandGuidelinesVersion } from '@sfx/domain';
import { useBrandGuidelinesHistoryDetail } from './use-brand-guidelines-history-detail';
import type {
  BrandGuidelinesHistoryDetailPageProps,
  BrandGuidelinesHistoryDetailSectionUIModel,
} from './types';

function joinList(values: readonly string[], emptyPlaceholder: string): string {
  if (values.length === 0) return emptyPlaceholder;
  return values.join(', ');
}

function renderVoice(
  voice: BrandGuidelinesVersion['snapshot']['voice'],
  emptyPlaceholder: string,
  readOnlySuffix: string,
): ReactNode {
  if (!voice) {
    return <p className="text-sm text-muted-foreground">{emptyPlaceholder}</p>;
  }
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-medium text-foreground">Tone</dt>
        <dd>
          <textarea
            readOnly
            disabled
            aria-disabled="true"
            aria-label={`Tone${readOnlySuffix}`}
            value={voice.tone}
            className="mt-1 w-full rounded border border-border bg-muted/40 p-2 text-foreground"
          />
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Preferred vocabulary</dt>
        <dd className="text-muted-foreground">
          {joinList([...voice.preferredVocabulary], emptyPlaceholder)}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-foreground">Restricted vocabulary</dt>
        <dd className="text-muted-foreground">
          {joinList([...voice.restrictedVocabulary], emptyPlaceholder)}
        </dd>
      </div>
    </dl>
  );
}

function renderVisual(
  visual: BrandGuidelinesVersion['snapshot']['visual'],
  emptyPlaceholder: string,
  readOnlySuffix: string,
): ReactNode {
  if (!visual) {
    return <p className="text-sm text-muted-foreground">{emptyPlaceholder}</p>;
  }
  return (
    <dl className="grid gap-3 text-sm">
      <div>
        <dt className="font-medium text-foreground">Logo usage</dt>
        <dd>
          <textarea
            readOnly
            disabled
            aria-disabled="true"
            aria-label={`Logo usage${readOnlySuffix}`}
            value={visual.logoUsage}
            className="mt-1 w-full rounded border border-border bg-muted/40 p-2 text-foreground"
          />
        </dd>
      </div>
    </dl>
  );
}

function renderDosAndDonts(
  entries: BrandGuidelinesVersion['snapshot']['dosAndDonts'],
  emptyPlaceholder: string,
  readOnlySuffix: string,
): ReactNode {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyPlaceholder}</p>;
  }
  return (
    <ul className="grid gap-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded border border-border bg-muted/40 p-2">
          <input
            readOnly
            disabled
            aria-disabled="true"
            aria-label={`${entry.type}: ${entry.category}${readOnlySuffix}`}
            value={entry.ruleText}
            className="w-full bg-transparent text-foreground"
          />
        </li>
      ))}
    </ul>
  );
}

function renderMetadata(
  metadata: BrandGuidelinesVersion['snapshot']['metadata'],
  emptyPlaceholder: string,
  readOnlySuffix: string,
): ReactNode {
  if (!metadata) {
    return <p className="text-sm text-muted-foreground">{emptyPlaceholder}</p>;
  }
  return (
    <dl className="grid gap-2 text-sm">
      <div>
        <dt className="font-medium text-foreground">Tags</dt>
        <dd>
          <input
            readOnly
            disabled
            aria-disabled="true"
            aria-label={`Tags${readOnlySuffix}`}
            value={joinList([...metadata.tags], emptyPlaceholder)}
            className="mt-1 w-full rounded border border-border bg-muted/40 p-2 text-foreground"
          />
        </dd>
      </div>
    </dl>
  );
}

function renderSectionBody(
  section: BrandGuidelinesHistoryDetailSectionUIModel,
  emptyPlaceholder: string,
  readOnlySuffix: string,
): ReactNode {
  switch (section.key) {
    case 'voice':
      return renderVoice(section.data, emptyPlaceholder, readOnlySuffix);
    case 'visual':
      return renderVisual(section.data, emptyPlaceholder, readOnlySuffix);
    case 'dosAndDonts':
      return renderDosAndDonts(section.data, emptyPlaceholder, readOnlySuffix);
    case 'metadata':
      return renderMetadata(section.data, emptyPlaceholder, readOnlySuffix);
  }
}

export function BrandGuidelinesHistoryDetailPage(
  props: BrandGuidelinesHistoryDetailPageProps,
): ReactNode {
  const { uiModel } = useBrandGuidelinesHistoryDetail(props.brandId, props.versionId);

  return (
    <main
      data-testid="brand-guidelines-history-detail-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6"
    >
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
        <Link
          href={uiModel.backToCurrent.href}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="brand-guidelines-history-detail-back-link"
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
          {uiModel.title}
        </div>
      )}

      {uiModel.status === 'denied' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-detail-denied"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.denied.title}</h2>
          <p className="mt-2 text-sm">{uiModel.denied.message}</p>
        </section>
      )}

      {uiModel.status === 'not-found' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-detail-not-found"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.notFound.title}</h2>
          <p className="mt-2 text-sm">{uiModel.notFound.message}</p>
        </section>
      )}

      {uiModel.status === 'error' && (
        <section
          role="alert"
          data-testid="brand-guidelines-history-detail-error"
          className="rounded-md border border-destructive bg-destructive/10 p-6"
        >
          <h2 className="text-lg font-semibold">{uiModel.error.title}</h2>
          <p className="mt-2 text-sm">{uiModel.error.message}</p>
        </section>
      )}

      {uiModel.status === 'ready' && (
        <>
          <div
            role="status"
            aria-live="polite"
            data-testid="brand-guidelines-history-detail-banner"
            className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
          >
            {uiModel.banner.message}
          </div>

          {uiModel.sections.map((section) => (
            <fieldset
              key={section.key}
              data-testid={`brand-guidelines-history-detail-section-${section.key}`}
              className="rounded-md border border-border bg-card p-6"
            >
              <legend className="px-2 text-sm font-semibold text-foreground">
                {section.title}
              </legend>
              {renderSectionBody(
                section,
                uiModel.emptyValuePlaceholder,
                uiModel.readOnlyAriaSuffix,
              )}
            </fieldset>
          ))}
        </>
      )}
    </main>
  );
}
