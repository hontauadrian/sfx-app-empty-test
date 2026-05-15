'use client';

import type { ReactNode } from 'react';
import type { BrandVoiceCardPlaceholderProps } from './types';

export function BrandVoiceCardPlaceholder({
  title,
  ctaLabel,
  ctaHref,
}: BrandVoiceCardPlaceholderProps): ReactNode {
  return (
    <section
      aria-labelledby="brand-voice-section-title"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2 id="brand-voice-section-title" className="text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section will host the brand&apos;s voice once it is configured.
      </p>
      <a
        className="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        href={ctaHref}
      >
        {ctaLabel}
      </a>
    </section>
  );
}
