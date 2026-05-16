'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { DosAndDontCategory, DosAndDontType } from '@sfx/validation';
import { useTranslations } from '@/features/presentation/localization';
import type { CommonTranslations } from '@/features/presentation/localization';
import { useDosAndDontsRepository } from '../../../data/repositories/use-dos-and-donts-repository';
import { useDeleteDosAndDontMutation } from '../../../data/repositories/use-delete-dos-and-dont-mutation';
import {
  dosAndDontEditRoute,
  dosAndDontNewRoute,
} from '../../../constants';
import { DeleteDosAndDontConfirmModal } from '../DeleteDosAndDontConfirmModal';
import { groupEntries } from './group-entries';
import type { DosAndDontsCardProps } from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

function categoryLabel(
  category: DosAndDontCategory,
  translations: CommonTranslations,
): string {
  switch (category) {
    case 'tone':
      return translations.dosAndDontCategoryToneLabel;
    case 'vocabulary':
      return translations.dosAndDontCategoryVocabularyLabel;
    case 'visuals':
      return translations.dosAndDontCategoryVisualsLabel;
    case 'legal':
      return translations.dosAndDontCategoryLegalLabel;
    case 'campaign-messaging':
      return translations.dosAndDontCategoryCampaignMessagingLabel;
  }
}

function typeLabel(type: DosAndDontType, translations: CommonTranslations): string {
  return type === 'do'
    ? translations.dosAndDontTypeDoLabel
    : translations.dosAndDontTypeDontLabel;
}

export function DosAndDontsCard({ brandId }: DosAndDontsCardProps): ReactNode {
  const translations = useTranslations('common');
  const query = useDosAndDontsRepository(brandId);
  const deleteMutation = useDeleteDosAndDontMutation(brandId);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const openDelete = useCallback((entryId: string): void => {
    setPendingDeleteId(entryId);
  }, []);
  const closeDelete = useCallback((): void => {
    setPendingDeleteId(null);
  }, []);
  const confirmDelete = useCallback(async (): Promise<void> => {
    if (pendingDeleteId === null) return;
    await deleteMutation.mutateAsync(pendingDeleteId);
    setPendingDeleteId(null);
  }, [deleteMutation, pendingDeleteId]);

  const isLoading = query.isLoading;
  const notFound = query.isError && isNotFound(query.error);
  const hasError = query.isError && !notFound;
  const entries = query.data ?? [];

  if (isLoading) {
    return (
      <section
        aria-labelledby="dos-and-donts-section-title"
        aria-busy="true"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="dos-and-donts-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.dosAndDontsSectionTitle}
        </h2>
        <div className="mt-4 h-20 w-full animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  if (notFound || hasError) {
    return (
      <section
        aria-labelledby="dos-and-donts-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="dos-and-donts-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.dosAndDontsSectionTitle}
        </h2>
        <p className="mt-2 text-sm text-destructive">
          {notFound ? translations.dosAndDontNotFound : translations.error}
        </p>
      </section>
    );
  }

  const grouped = groupEntries(entries);

  if (grouped.length === 0) {
    return (
      <section
        aria-labelledby="dos-and-donts-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="dos-and-donts-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.dosAndDontsSectionTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {translations.dosAndDontsEmptyStateBody}
        </p>
        <a
          className="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          href={dosAndDontNewRoute(brandId)}
        >
          {translations.addDosAndDontCta}
        </a>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="dos-and-donts-section-title"
      className="rounded-lg border border-border bg-card p-6"
    >
      <header className="flex items-start justify-between gap-2">
        <h2
          id="dos-and-donts-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.dosAndDontsSectionTitle}
        </h2>
        <a
          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          href={dosAndDontNewRoute(brandId)}
        >
          {translations.addDosAndDontCta}
        </a>
      </header>
      <div className="mt-4 space-y-6">
        {grouped.map((categoryGroup) => (
          <div key={categoryGroup.category} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {categoryLabel(categoryGroup.category, translations)}
            </h3>
            {categoryGroup.types.map((typeRow) => (
              <div key={typeRow.type} className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {typeLabel(typeRow.type, translations)}
                </p>
                <ul className="space-y-2">
                  {typeRow.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {entry.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {entry.body}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <a
                            href={dosAndDontEditRoute(brandId, entry.id)}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            {translations.editDosAndDontCta}
                          </a>
                          <button
                            type="button"
                            onClick={() => openDelete(entry.id)}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-destructive hover:bg-muted"
                          >
                            {translations.deleteDosAndDontCta}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
      {pendingDeleteId !== null ? (
        <DeleteDosAndDontConfirmModal
          title={translations.deleteDosAndDontConfirmTitle}
          body={translations.deleteDosAndDontConfirmBody}
          confirmLabel={translations.deleteDosAndDontCta}
          cancelLabel={translations.dosAndDontCancelLabel}
          isSubmitting={deleteMutation.isPending}
          onConfirm={() => {
            void confirmDelete();
          }}
          onCancel={closeDelete}
        />
      ) : null}
    </section>
  );
}
