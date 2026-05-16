'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useBrandVoiceRepository } from '../../../data/repositories/use-brand-voice-repository';
import { voiceEditRoute } from '../../../constants';
import type { BrandVoice } from '../../../data/mapper/map-to-brand-voice';
import type { BrandVoiceCardProps } from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

function hasAnyContent(voice: BrandVoice | undefined): boolean {
  if (!voice) return false;
  if (voice.toneOfVoice !== null && voice.toneOfVoice.length > 0) return true;
  if (voice.preferredVocabulary.length > 0) return true;
  if (voice.restrictedVocabulary.length > 0) return true;
  if (voice.messagingPillars.length > 0) return true;
  if (voice.writingStyleRules.length > 0) return true;
  if (voice.audienceRules.length > 0) return true;
  if (voice.approvedExamplePhrases.length > 0) return true;
  if (voice.rejectedExamplePhrases.length > 0) return true;
  return false;
}

interface ListSectionProps {
  readonly title: string;
  readonly items: readonly string[];
}

function ListSection({ title, items }: ListSectionProps): ReactNode {
  if (items.length === 0) return null;
  return (
    <section className="mt-4" aria-labelledby={`brand-voice-${title}`}>
      <h3
        id={`brand-voice-${title}`}
        className="text-sm font-semibold text-foreground"
      >
        {title} ({items.length})
      </h3>
      <ul className="mt-1 list-disc pl-5 text-sm text-foreground">
        {items.slice(0, 5).map((entry, index) => (
          <li key={`${title}-${index}`}>{entry}</li>
        ))}
      </ul>
      {items.length > 5 ? (
        <p className="mt-1 text-xs text-muted-foreground">+{items.length - 5} more</p>
      ) : null}
    </section>
  );
}

export function BrandVoiceCard({ brandId }: BrandVoiceCardProps): ReactNode {
  const translations = useTranslations('common');
  const query = useBrandVoiceRepository(brandId);

  if (query.isLoading) {
    return (
      <section
        aria-labelledby="brand-voice-section-title"
        aria-busy="true"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2 id="brand-voice-section-title" className="text-xl font-semibold text-foreground">
          {translations.brandVoiceSectionTitle}
        </h2>
        <div className="mt-4 h-20 w-full animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  const notFound = query.isError && isNotFound(query.error);
  if (query.isError && !notFound) {
    return (
      <section
        aria-labelledby="brand-voice-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2 id="brand-voice-section-title" className="text-xl font-semibold text-foreground">
          {translations.brandVoiceSectionTitle}
        </h2>
        <p className="mt-2 text-sm text-destructive">{translations.error}</p>
      </section>
    );
  }

  if (!hasAnyContent(query.data)) {
    return (
      <section
        aria-labelledby="brand-voice-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2 id="brand-voice-section-title" className="text-xl font-semibold text-foreground">
          {translations.brandVoiceSectionTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {translations.brandVoiceEmptyStateBody}
        </p>
        <a
          className="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          href={voiceEditRoute(brandId)}
        >
          {translations.editBrandVoice}
        </a>
      </section>
    );
  }

  const voice = query.data as BrandVoice;
  return (
    <section
      aria-labelledby="brand-voice-section-title"
      className="rounded-lg border border-border bg-card p-6"
    >
      <header className="flex items-start justify-between gap-2">
        <h2 id="brand-voice-section-title" className="text-xl font-semibold text-foreground">
          {translations.brandVoiceSectionTitle}
        </h2>
        <a
          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          href={voiceEditRoute(brandId)}
        >
          {translations.editBrandVoice}
        </a>
      </header>
      {voice.toneOfVoice !== null && voice.toneOfVoice.length > 0 ? (
        <section className="mt-4" aria-labelledby="brand-voice-tone">
          <h3 id="brand-voice-tone" className="text-sm font-semibold text-foreground">
            {translations.brandVoiceToneOfVoiceLabel}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {voice.toneOfVoice}
          </p>
        </section>
      ) : null}
      <ListSection
        title={translations.brandVoicePreferredVocabularyLabel}
        items={voice.preferredVocabulary}
      />
      <ListSection
        title={translations.brandVoiceRestrictedVocabularyLabel}
        items={voice.restrictedVocabulary}
      />
      <ListSection
        title={translations.brandVoiceMessagingPillarsLabel}
        items={voice.messagingPillars}
      />
      <ListSection
        title={translations.brandVoiceWritingStyleRulesLabel}
        items={voice.writingStyleRules}
      />
      {voice.audienceRules.length > 0 ? (
        <section className="mt-4" aria-labelledby="brand-voice-audience">
          <h3 id="brand-voice-audience" className="text-sm font-semibold text-foreground">
            {translations.brandVoiceAudienceRulesLabel} ({voice.audienceRules.length})
          </h3>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {voice.audienceRules.slice(0, 5).map((entry, index) => (
              <li key={`audience-${index}`}>
                <strong>{entry.audience}:</strong> {entry.rule}
              </li>
            ))}
          </ul>
          {voice.audienceRules.length > 5 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              +{voice.audienceRules.length - 5} more
            </p>
          ) : null}
        </section>
      ) : null}
      <ListSection
        title={translations.brandVoiceApprovedPhrasesLabel}
        items={voice.approvedExamplePhrases}
      />
      <ListSection
        title={translations.brandVoiceRejectedPhrasesLabel}
        items={voice.rejectedExamplePhrases}
      />
    </section>
  );
}
