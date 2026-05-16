'use client';

import type { ReactNode } from 'react';
import type { VisualIdentityReadViewProps } from './types';

interface TextBlockProps {
  readonly title: string;
  readonly body: string | null;
}

function TextBlock({ title, body }: TextBlockProps): ReactNode {
  if (body === null || body.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{body}</p>
    </section>
  );
}

export function VisualIdentityReadView({
  identity,
  labels,
}: VisualIdentityReadViewProps): ReactNode {
  return (
    <div>
      <TextBlock title={labels.logoUsageRulesLabel} body={identity.logoUsageRules} />
      {identity.colourPalette.length > 0 ? (
        <section className="mt-4" aria-labelledby="visual-identity-palette">
          <h3
            id="visual-identity-palette"
            className="text-sm font-semibold text-foreground"
          >
            {labels.colourPaletteLabel} ({identity.colourPalette.length})
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {identity.colourPalette.slice(0, 5).map((entry, index) => (
              <li
                key={`palette-${index}`}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className="block h-4 w-4 rounded-md border border-border"
                  style={{ backgroundColor: entry.hex }}
                />
                <span>
                  <strong>{entry.name}</strong> · {entry.hex}
                  {entry.usage !== null && entry.usage.length > 0
                    ? ` · ${entry.usage}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
          {identity.colourPalette.length > 5 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              +{identity.colourPalette.length - 5} more
            </p>
          ) : null}
        </section>
      ) : null}
      {identity.typographyRules.length > 0 ? (
        <section className="mt-4" aria-labelledby="visual-identity-typography">
          <h3
            id="visual-identity-typography"
            className="text-sm font-semibold text-foreground"
          >
            {labels.typographyRulesLabel} ({identity.typographyRules.length})
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {identity.typographyRules.slice(0, 5).map((entry, index) => (
              <li key={`typography-${index}`}>
                <strong>{entry.role}</strong> · {entry.family}
                {entry.weight !== null ? ` · ${entry.weight}` : ''}
                {entry.size !== null ? ` · ${entry.size}` : ''}
              </li>
            ))}
          </ul>
          {identity.typographyRules.length > 5 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              +{identity.typographyRules.length - 5} more
            </p>
          ) : null}
        </section>
      ) : null}
      <TextBlock
        title={labels.spacingLayoutGuidanceLabel}
        body={identity.spacingLayoutGuidance}
      />
      <TextBlock
        title={labels.imageStyleGuidanceLabel}
        body={identity.imageStyleGuidance}
      />
      <TextBlock
        title={labels.iconographyGuidanceLabel}
        body={identity.iconographyGuidance}
      />
      <TextBlock
        title={labels.usageRestrictionsLabel}
        body={identity.usageRestrictions}
      />
    </div>
  );
}
