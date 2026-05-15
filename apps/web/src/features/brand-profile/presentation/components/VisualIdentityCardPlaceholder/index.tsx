'use client';

import type { ReactNode } from 'react';
import type { VisualIdentityCardPlaceholderProps } from './types';

export function VisualIdentityCardPlaceholder({
  title,
  ctaLabel,
  ctaHref,
}: VisualIdentityCardPlaceholderProps): ReactNode {
  return (
    <section
      aria-labelledby="visual-identity-section-title"
      className="rounded-lg border border-border bg-card p-6"
    >
      <h2 id="visual-identity-section-title" className="text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section will host the brand&apos;s visual identity once it is configured.
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
