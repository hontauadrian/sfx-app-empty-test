'use client';

import { useCallback, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { TypographyRulesListEditorProps } from './types';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

interface TypographyRow {
  readonly role: string;
  readonly family: string;
  readonly weight: string | null;
  readonly size: string | null;
  readonly notes: string | null;
}

export function TypographyRulesListEditor(
  props: TypographyRulesListEditorProps,
): ReactNode {
  const {
    control,
    label,
    roleLabel,
    familyLabel,
    weightLabel,
    sizeLabel,
    notesLabel,
    addLabel,
    removeLabel,
    emptyPlaceholder,
    shortMaxLength,
  } = props;
  const formContext = useFormContext<VisualIdentityFormValues>();
  const watched = useWatch({ control, name: 'typographyRules' }) as
    | readonly TypographyRow[]
    | undefined;
  const items = watched ?? [];

  const setItems = useCallback(
    (next: readonly TypographyRow[]): void => {
      formContext.setValue('typographyRules', next as never, {
        shouldDirty: true,
        shouldValidate: false,
      });
    },
    [formContext],
  );

  const handleAdd = useCallback((): void => {
    setItems([
      ...items,
      { role: '', family: '', weight: null, size: null, notes: null },
    ]);
  }, [items, setItems]);

  const handleRemove = useCallback(
    (index: number): void => {
      setItems(items.filter((_, idx) => idx !== index));
    },
    [items, setItems],
  );

  const updateField = useCallback(
    (index: number, patch: Partial<TypographyRow>): void => {
      setItems(
        items.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)),
      );
    },
    [items, setItems],
  );

  const arrayError = (formContext.formState.errors as Record<string, unknown>)
    .typographyRules as
    | { root?: { message?: string }; message?: string }
    | undefined;
  const arrayMessage = arrayError?.root?.message ?? arrayError?.message ?? null;

  return (
    <fieldset className="space-y-2" data-testid="typography-rules-editor">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyPlaceholder}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((entry, index) => {
            const rowErrors = (
              (formContext.formState.errors as Record<string, unknown>)
                .typographyRules as
                | Array<
                    | {
                        role?: { message?: string };
                        family?: { message?: string };
                      }
                    | undefined
                  >
                | undefined
            )?.[index];
            return (
              <li
                key={`typography-row-${index}`}
                className="rounded-md border border-border p-3"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-foreground">
                    <span>{roleLabel}</span>
                    <input
                      type="text"
                      value={entry.role}
                      maxLength={shortMaxLength}
                      onChange={(event) =>
                        updateField(index, { role: event.target.value })
                      }
                      aria-label={`${roleLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {rowErrors?.role?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.role.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{familyLabel}</span>
                    <input
                      type="text"
                      value={entry.family}
                      maxLength={shortMaxLength}
                      onChange={(event) =>
                        updateField(index, { family: event.target.value })
                      }
                      aria-label={`${familyLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {rowErrors?.family?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.family.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{weightLabel}</span>
                    <input
                      type="text"
                      value={entry.weight ?? ''}
                      maxLength={shortMaxLength}
                      onChange={(event) =>
                        updateField(index, {
                          weight:
                            event.target.value.length === 0 ? null : event.target.value,
                        })
                      }
                      aria-label={`${weightLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{sizeLabel}</span>
                    <input
                      type="text"
                      value={entry.size ?? ''}
                      maxLength={shortMaxLength}
                      onChange={(event) =>
                        updateField(index, {
                          size:
                            event.target.value.length === 0 ? null : event.target.value,
                        })
                      }
                      aria-label={`${sizeLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="text-xs text-foreground sm:col-span-2">
                    <span>{notesLabel}</span>
                    <textarea
                      value={entry.notes ?? ''}
                      onChange={(event) =>
                        updateField(index, {
                          notes:
                            event.target.value.length === 0 ? null : event.target.value,
                        })
                      }
                      aria-label={`${notesLabel} ${index + 1}`}
                      className="mt-1 h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    {removeLabel}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {arrayMessage !== null ? (
        <p className="text-xs text-destructive">{arrayMessage}</p>
      ) : null}
      <button
        type="button"
        onClick={handleAdd}
        className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
