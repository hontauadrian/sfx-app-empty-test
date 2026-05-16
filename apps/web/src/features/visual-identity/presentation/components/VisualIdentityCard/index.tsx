'use client';

import type { ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useVisualIdentityRepository } from '../../../data/repositories/use-visual-identity-repository';
import { visualIdentityEditRoute } from '../../../constants';
import { VisualIdentityReadView } from '../VisualIdentityReadView';
import type { VisualIdentityReadViewLabels } from '../VisualIdentityReadView/types';
import type { VisualIdentityCardProps } from './types';

interface ErrorWithStatus extends Error {
  readonly status?: number;
}

function isNotFound(error: unknown): boolean {
  if (error === null || error === undefined || typeof error !== 'object') return false;
  return (error as ErrorWithStatus).status === 404;
}

function readViewLabels(
  translations: ReturnType<typeof useTranslations<'common'>>,
): VisualIdentityReadViewLabels {
  return {
    logoUsageRulesLabel: translations.visualIdentityLogoUsageRulesLabel,
    colourPaletteLabel: translations.visualIdentityColourPaletteLabel,
    typographyRulesLabel: translations.visualIdentityTypographyRulesLabel,
    spacingLayoutGuidanceLabel: translations.visualIdentitySpacingLayoutGuidanceLabel,
    imageStyleGuidanceLabel: translations.visualIdentityImageStyleGuidanceLabel,
    iconographyGuidanceLabel: translations.visualIdentityIconographyGuidanceLabel,
    usageRestrictionsLabel: translations.visualIdentityUsageRestrictionsLabel,
    colourPaletteNameLabel: translations.visualIdentityColourPaletteNameLabel,
    colourPaletteHexLabel: translations.visualIdentityColourPaletteHexLabel,
    colourPaletteUsageLabel: translations.visualIdentityColourPaletteUsageLabel,
    typographyRoleLabel: translations.visualIdentityTypographyRoleLabel,
    typographyFamilyLabel: translations.visualIdentityTypographyFamilyLabel,
    typographyWeightLabel: translations.visualIdentityTypographyWeightLabel,
    typographySizeLabel: translations.visualIdentityTypographySizeLabel,
    typographyNotesLabel: translations.visualIdentityTypographyNotesLabel,
  };
}

export function VisualIdentityCard({ brandId }: VisualIdentityCardProps): ReactNode {
  const translations = useTranslations('common');
  const query = useVisualIdentityRepository(brandId);

  if (query.isLoading) {
    return (
      <section
        aria-labelledby="visual-identity-section-title"
        aria-busy="true"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="visual-identity-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.visualIdentitySectionTitle}
        </h2>
        <div className="mt-4 h-20 w-full animate-pulse rounded-md bg-muted" />
      </section>
    );
  }

  const notFound = query.isError && isNotFound(query.error);
  if (query.isError && !notFound) {
    return (
      <section
        aria-labelledby="visual-identity-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="visual-identity-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.visualIdentitySectionTitle}
        </h2>
        <p className="mt-2 text-sm text-destructive">{translations.error}</p>
      </section>
    );
  }

  const identity = query.data ?? null;

  if (identity === null) {
    return (
      <section
        aria-labelledby="visual-identity-section-title"
        className="rounded-lg border border-border bg-card p-6"
      >
        <h2
          id="visual-identity-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.visualIdentitySectionTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {translations.visualIdentityEmptyStateBody}
        </p>
        <a
          className="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          href={visualIdentityEditRoute(brandId)}
        >
          {translations.editVisualIdentity}
        </a>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="visual-identity-section-title"
      className="rounded-lg border border-border bg-card p-6"
    >
      <header className="flex items-start justify-between gap-2">
        <h2
          id="visual-identity-section-title"
          className="text-xl font-semibold text-foreground"
        >
          {translations.visualIdentitySectionTitle}
        </h2>
        <a
          className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
          href={visualIdentityEditRoute(brandId)}
        >
          {translations.editVisualIdentity}
        </a>
      </header>
      <VisualIdentityReadView identity={identity} labels={readViewLabels(translations)} />
    </section>
  );
}
