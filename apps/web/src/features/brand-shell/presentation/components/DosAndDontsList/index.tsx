'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { DOS_DONTS_CATEGORIES, DOS_DONTS_TYPES } from '../../../data/dos-donts-enums';
import type {
  DosDontsCategory,
  DosDontsEntry,
  DosDontsType,
} from '@sfx/domain';
import { useTranslations } from '@/features/presentation/localization';
import { useDosAndDontsRepository } from '../../../data/repositories/use-dos-and-donts-repository';
import { DeleteDosDontsConfirm } from '../DeleteDosDontsConfirm';
import { DosAndDontsRowEditor } from '../DosAndDontsRowEditor';
import type { DosDontsRowEditorValues } from '../DosAndDontsRowEditor/types';
import { ViewHistoryLink } from '../ViewHistoryLink';
import type { DosAndDontsListProps, DosDontsFilterState } from './types';

const EMPTY_VALUES: DosDontsRowEditorValues = {
  type: '',
  category: '',
  ruleText: '',
  exampleText: '',
};

function toEditorValues(entry: DosDontsEntry): DosDontsRowEditorValues {
  return {
    type: entry.type,
    category: entry.category,
    ruleText: entry.ruleText,
    exampleText: entry.exampleText ?? '',
  };
}

export function DosAndDontsList({ brandId, focusEntryId }: DosAndDontsListProps): ReactNode {
  const labels = useTranslations('common').adminBrandGuidelines.dosAndDonts!;
  const [filters, setFilters] = useState<DosDontsFilterState>({ type: '', category: '' });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DosDontsEntry | null>(null);

  const repo = useDosAndDontsRepository({
    brandId,
    type: filters.type || undefined,
    category: filters.category || undefined,
  });
  const entries = repo.listQuery.data ?? [];

  const handleAddSubmit = useCallback(
    (values: DosDontsRowEditorValues): void => {
      repo.createMutation.mutate(
        {
          type: values.type as DosDontsType,
          category: values.category as DosDontsCategory,
          ruleText: values.ruleText.trim(),
          exampleText: values.exampleText.trim() || null,
        },
        { onSuccess: () => setAdding(false) },
      );
    },
    [repo.createMutation],
  );

  const handleUpdateSubmit = useCallback(
    (entry: DosDontsEntry, values: DosDontsRowEditorValues): void => {
      repo.updateMutation.mutate(
        {
          entryId: entry.id,
          type: values.type as DosDontsType,
          category: values.category as DosDontsCategory,
          ruleText: values.ruleText.trim(),
          exampleText: values.exampleText.trim() || null,
        },
        { onSuccess: () => setEditingId(null) },
      );
    },
    [repo.updateMutation],
  );

  const handleConfirmDelete = useCallback((): void => {
    if (!pendingDelete) return;
    repo.deleteMutation.mutate(
      { entryId: pendingDelete.id },
      { onSuccess: () => setPendingDelete(null) },
    );
  }, [pendingDelete, repo.deleteMutation]);

  return (
    <section
      aria-label={labels.sectionTitle}
      className="space-y-4"
      data-section="dosAndDonts"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">{labels.sectionTitle}</h2>
        <ViewHistoryLink brandId={brandId} section="dosAndDonts" />
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">{labels.filters.typeLabel}</span>
          <select
            data-testid="dos-donts-type-filter"
            className="rounded border border-border bg-background px-2 py-1"
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                type: event.target.value as DosDontsType | '',
              }))
            }
          >
            <option value="">{labels.filters.allTypes}</option>
            {DOS_DONTS_TYPES.map((option) => (
              <option key={option} value={option}>
                {labels.typeOptions[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">{labels.filters.categoryLabel}</span>
          <select
            data-testid="dos-donts-category-filter"
            className="rounded border border-border bg-background px-2 py-1"
            value={filters.category}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                category: event.target.value as DosDontsCategory | '',
              }))
            }
          >
            <option value="">{labels.filters.allCategories}</option>
            {DOS_DONTS_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {labels.categoryOptions[option]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={adding || repo.createMutation.isPending}
          className="ml-auto rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        >
          {repo.createMutation.isPending ? labels.addingCta : labels.addCta}
        </button>
      </header>

      {adding ? (
        <DosAndDontsRowEditor
          initialValues={EMPTY_VALUES}
          isSubmitting={repo.createMutation.isPending}
          onSubmit={handleAddSubmit}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {entries.length === 0 && !adding ? (
        <div className="rounded-md border border-dashed border-border bg-card p-6 text-center text-foreground">
          <h3 className="text-base font-semibold">{labels.emptyState.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{labels.emptyState.message}</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const isEditing = editingId === entry.id;
          const isFocused = focusEntryId === entry.id;
          return (
            <li
              key={entry.id}
              id={`entry-${entry.id}`}
              data-testid={`dos-donts-row-${entry.id}`}
              className={`rounded-md border bg-card p-3 text-foreground ${
                isFocused ? 'border-primary' : 'border-border'
              }`}
            >
              {isEditing ? (
                <DosAndDontsRowEditor
                  initialValues={toEditorValues(entry)}
                  isSubmitting={repo.updateMutation.isPending}
                  onSubmit={(values) => handleUpdateSubmit(entry, values)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                      <span>{labels.typeOptions[entry.type]}</span>
                      <span>·</span>
                      <span>{labels.categoryOptions[entry.category]}</span>
                    </div>
                    <p className="text-sm">{entry.ruleText}</p>
                    {entry.exampleText ? (
                      <p className="text-xs text-muted-foreground">{entry.exampleText}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(entry.id)}
                      className="rounded border border-border bg-background px-2 py-1 text-xs"
                    >
                      {labels.cta.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(entry)}
                      className="rounded border border-destructive bg-background px-2 py-1 text-xs text-destructive"
                    >
                      {labels.cta.delete}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <DeleteDosDontsConfirm
        open={pendingDelete !== null}
        ruleFragment={pendingDelete?.ruleText.slice(0, 80) ?? ''}
        isSubmitting={repo.deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
