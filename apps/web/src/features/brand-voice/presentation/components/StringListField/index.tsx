'use client';

import { useCallback, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { StringListFieldProps } from './types';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

interface ItemError {
  readonly message?: string;
}

export function StringListField(props: StringListFieldProps): ReactNode {
  const { control, name, label, addLabel, removeLabel, emptyPlaceholder, itemMaxLength, testId } = props;
  const formContext = useFormContext<BrandVoiceFormValues>();
  const watched = useWatch({ control, name }) as readonly string[] | undefined;
  const items = watched ?? [];

  const setItems = useCallback(
    (next: readonly string[]): void => {
      formContext.setValue(name, next as never, { shouldDirty: true, shouldValidate: false });
    },
    [formContext, name],
  );

  const handleAdd = useCallback((): void => {
    setItems([...items, '']);
  }, [items, setItems]);

  const handleRemove = useCallback(
    (index: number): void => {
      setItems(items.filter((_, idx) => idx !== index));
    },
    [items, setItems],
  );

  const handleChange = useCallback(
    (index: number, value: string): void => {
      setItems(items.map((entry, idx) => (idx === index ? value : entry)));
    },
    [items, setItems],
  );

  const arrayError = (formContext.formState.errors as Record<string, unknown>)[name] as
    | { root?: { message?: string }; message?: string }
    | undefined;
  const arrayMessage = arrayError?.root?.message ?? arrayError?.message ?? null;

  return (
    <fieldset className="space-y-2" data-testid={testId ?? `string-list-${name}`}>
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyPlaceholder}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((entry, index) => {
            const itemError = (
              (formContext.formState.errors as Record<string, ItemError[] | undefined>)[name] ?? []
            )[index];
            const itemMessage = itemError?.message;
            const inputId = `${name}-${index}`;
            return (
              <li key={inputId} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    id={inputId}
                    type="text"
                    value={entry}
                    maxLength={itemMaxLength}
                    onChange={(event) => handleChange(index, event.target.value)}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={itemMessage !== undefined}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    {removeLabel}
                  </button>
                </div>
                {itemMessage !== undefined ? (
                  <p className="text-xs text-destructive">{itemMessage}</p>
                ) : null}
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
