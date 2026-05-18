'use client';

import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from '@/features/presentation/localization';
import { useBrandMetadataRepository } from '../../../data/repositories/use-brand-metadata-repository';
import { canAcceptTag } from '../../validators/upsert-brand-metadata.resolver';
import { ViewHistoryLink } from '../ViewHistoryLink';
import type { MetadataFormProps } from './types';

export function MetadataForm({ brandId }: MetadataFormProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.metadata!;
  const repo = useBrandMetadataRepository({ brandId });
  const [tags, setTags] = useState<readonly string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const metadata = repo.metadataQuery.data;
  const effectiveTags = tags ?? metadata?.tags ?? [];

  const handleAddTag = useCallback((): void => {
    const verdict = canAcceptTag(draft, effectiveTags, labels.validation);
    if (!verdict.ok) {
      if (verdict.reason === 'empty' || verdict.reason === 'duplicate') {
        setDraft('');
        return;
      }
      setError(verdict.reason);
      return;
    }
    setTags([...effectiveTags, draft.trim()]);
    setDraft('');
    setError(null);
  }, [draft, effectiveTags, labels.validation]);

  const handleRemoveTag = useCallback((tag: string): void => {
    setTags(effectiveTags.filter((existing) => existing !== tag));
    setError(null);
  }, [effectiveTags]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleAddTag();
        return;
      }
      if (event.key === 'Backspace' && draft.length === 0 && effectiveTags.length > 0) {
        event.preventDefault();
        handleRemoveTag(effectiveTags[effectiveTags.length - 1]!);
      }
    },
    [draft, effectiveTags, handleAddTag, handleRemoveTag],
  );

  const handleSave = useCallback((): void => {
    repo.updateMutation.mutate(
      { tags: effectiveTags },
      { onSuccess: () => setTags(null) },
    );
  }, [effectiveTags, repo.updateMutation]);

  const lastUpdatedText = metadata
    ? labels.lastUpdatedTemplate
        .replace('{editor}', metadata.lastUpdatedByUserId)
        .replace('{date}', metadata.lastUpdatedAt.toLocaleDateString())
    : '';

  return (
    <section
      aria-label={labels.sectionTitle}
      className="space-y-4"
      data-section="metadata"
    >
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{labels.sectionTitle}</h2>
          <ViewHistoryLink brandId={brandId} section="metadata" />
        </div>
        {metadata ? (
          <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <dt className="font-medium">{labels.owner}:</dt>
              <dd>{metadata.ownerUserId}</dd>
            </div>
            <div>{lastUpdatedText}</div>
          </dl>
        ) : null}
      </header>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="metadata-tag-input">
          {labels.tagsLabel}
        </label>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-2">
          {effectiveTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                aria-label={labels.removeTagAriaTemplate.replace('{tag}', tag)}
                className="text-secondary-foreground/70 hover:text-secondary-foreground"
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="metadata-tag-input"
            type="text"
            value={draft}
            placeholder={labels.addTagPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-foreground outline-none"
          />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={repo.updateMutation.isPending}
        className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
      >
        {repo.updateMutation.isPending ? labels.cta.saving : labels.cta.save}
      </button>
    </section>
  );
}
