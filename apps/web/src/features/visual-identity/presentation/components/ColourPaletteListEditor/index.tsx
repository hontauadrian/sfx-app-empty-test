'use client';

import { useCallback, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { ColourPaletteListEditorProps } from './types';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';

interface ColourRow {
  readonly name: string;
  readonly hex: string;
  readonly usage: string | null;
}

export function ColourPaletteListEditor(
  props: ColourPaletteListEditorProps,
): ReactNode {
  const {
    control,
    label,
    nameLabel,
    hexLabel,
    usageLabel,
    addLabel,
    removeLabel,
    emptyPlaceholder,
    nameMaxLength,
  } = props;
  const formContext = useFormContext<VisualIdentityFormValues>();
  const watched = useWatch({ control, name: 'colourPalette' }) as
    | readonly ColourRow[]
    | undefined;
  const items = watched ?? [];

  const setItems = useCallback(
    (next: readonly ColourRow[]): void => {
      formContext.setValue('colourPalette', next as never, {
        shouldDirty: true,
        shouldValidate: false,
      });
    },
    [formContext],
  );

  const handleAdd = useCallback((): void => {
    setItems([...items, { name: '', hex: '', usage: null }]);
  }, [items, setItems]);

  const handleRemove = useCallback(
    (index: number): void => {
      setItems(items.filter((_, idx) => idx !== index));
    },
    [items, setItems],
  );

  const updateField = useCallback(
    (index: number, patch: Partial<ColourRow>): void => {
      setItems(items.map((entry, idx) => (idx === index ? { ...entry, ...patch } : entry)));
    },
    [items, setItems],
  );

  const arrayError = (formContext.formState.errors as Record<string, unknown>)
    .colourPalette as
    | { root?: { message?: string }; message?: string }
    | undefined;
  const arrayMessage = arrayError?.root?.message ?? arrayError?.message ?? null;

  return (
    <fieldset className="space-y-2" data-testid="colour-palette-editor">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyPlaceholder}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((entry, index) => {
            const rowErrors = (
              (formContext.formState.errors as Record<string, unknown>)
                .colourPalette as
                | Array<
                    | {
                        name?: { message?: string };
                        hex?: { message?: string };
                        usage?: { message?: string };
                      }
                    | undefined
                  >
                | undefined
            )?.[index];
            return (
              <li
                key={`colour-row-${index}`}
                className="rounded-md border border-border p-3"
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-foreground">
                    <span>{nameLabel}</span>
                    <input
                      type="text"
                      value={entry.name}
                      maxLength={nameMaxLength}
                      onChange={(event) =>
                        updateField(index, { name: event.target.value })
                      }
                      aria-label={`${nameLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {rowErrors?.name?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.name.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{hexLabel}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={entry.hex}
                        onChange={(event) =>
                          updateField(index, { hex: event.target.value })
                        }
                        aria-label={`${hexLabel} ${index + 1}`}
                        className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                      />
                      <span
                        aria-hidden="true"
                        className="block h-6 w-6 rounded-md border border-border"
                        style={{ backgroundColor: entry.hex }}
                      />
                    </div>
                    {rowErrors?.hex?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.hex.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{usageLabel}</span>
                    <input
                      type="text"
                      value={entry.usage ?? ''}
                      onChange={(event) =>
                        updateField(index, {
                          usage:
                            event.target.value.length === 0 ? null : event.target.value,
                        })
                      }
                      aria-label={`${usageLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
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
