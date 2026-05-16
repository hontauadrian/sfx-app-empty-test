import type { ReactNode } from 'react';
import type { ContentCheckResultListProps } from './types';

export function ContentCheckResultList(props: ContentCheckResultListProps): ReactNode {
  const { resultsTitle, suggestedCorrectionLabel, groups } = props;
  return (
    <section
      aria-label={resultsTitle}
      className="space-y-6 rounded-md border border-border bg-card p-4"
    >
      <h2 className="text-lg font-semibold text-foreground">{resultsTitle}</h2>
      {groups.map((group) => (
        <div key={group.key} className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">
            {group.categoryLabel}
          </h3>
          {group.rows.map((row) => (
            <div key={row.key} className="space-y-2">
              <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {row.typeLabel}
              </h4>
              <ul className="space-y-3">
                {row.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                      {entry.body}
                    </p>
                    {entry.suggestedCorrection !== null ? (
                      <div className="mt-2 border-l-2 border-primary pl-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {suggestedCorrectionLabel}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                          {entry.suggestedCorrection}
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
