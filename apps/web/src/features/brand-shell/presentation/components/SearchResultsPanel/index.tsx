'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { GuidelineSearchSection } from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import type { SearchResultsPanelProps } from './types';

export function SearchResultsPanel({
  query,
  isLoading,
  error,
  result,
}: SearchResultsPanelProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.search!;
  if (query.trim().length === 0) return null;
  if (isLoading) {
    return (
      <section
        aria-label={labels.loadingAriaLabel}
        role="status"
        className="mt-3 rounded-md border border-border bg-card p-4 text-foreground"
      >
        <div className="h-3 w-32 animate-pulse rounded bg-border" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="mt-3 rounded-md border border-destructive bg-card p-4 text-destructive">
        {labels.empty}
      </section>
    );
  }
  const groups = result?.groups ?? [];
  const hasItems = groups.some((group) => group.items.length > 0);
  if (!hasItems) {
    return (
      <section className="mt-3 rounded-md border border-border bg-card p-4 text-foreground">
        {labels.empty}
      </section>
    );
  }
  return (
    <section
      aria-label="brand-guidelines-search-results"
      className="mt-3 space-y-3 rounded-md border border-border bg-card p-4 text-foreground"
    >
      {groups.map((group) => (
        <div key={group.section}>
          <h3 className="text-sm font-semibold">
            {labels.sectionTitles[group.section as GuidelineSearchSection]}
          </h3>
          <ul className="mt-1 space-y-1">
            {group.items.map((item) => (
              <li key={`${group.section}-${item.id}`}>
                <Link
                  href={item.href}
                  className="block rounded px-2 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {item.fragment}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
