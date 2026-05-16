'use client';

import { useCallback, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AudienceRuleListFieldProps } from './types';
import type { BrandVoiceFormValues } from '../../validators/brand-voice-form';

interface AudienceRuleRow {
  readonly audience: string;
  readonly rule: string;
}

export function AudienceRuleListField(props: AudienceRuleListFieldProps): ReactNode {
  const {
    control,
    label,
    audienceLabel,
    ruleLabel,
    addLabel,
    removeLabel,
    emptyPlaceholder,
    audienceMaxLength,
    ruleMaxLength,
  } = props;
  const formContext = useFormContext<BrandVoiceFormValues>();
  const watched = useWatch({ control, name: 'audienceRules' }) as
    | readonly AudienceRuleRow[]
    | undefined;
  const items = watched ?? [];

  const setItems = useCallback(
    (next: readonly AudienceRuleRow[]): void => {
      formContext.setValue('audienceRules', next as never, {
        shouldDirty: true,
        shouldValidate: false,
      });
    },
    [formContext],
  );

  const handleAdd = useCallback((): void => {
    setItems([...items, { audience: '', rule: '' }]);
  }, [items, setItems]);

  const handleRemove = useCallback(
    (index: number): void => {
      setItems(items.filter((_, idx) => idx !== index));
    },
    [items, setItems],
  );

  const handleAudienceChange = useCallback(
    (index: number, value: string): void => {
      setItems(
        items.map((entry, idx) =>
          idx === index ? { ...entry, audience: value } : entry,
        ),
      );
    },
    [items, setItems],
  );

  const handleRuleChange = useCallback(
    (index: number, value: string): void => {
      setItems(
        items.map((entry, idx) => (idx === index ? { ...entry, rule: value } : entry)),
      );
    },
    [items, setItems],
  );

  const arrayError = (formContext.formState.errors as Record<string, unknown>)
    .audienceRules as
    | { root?: { message?: string }; message?: string }
    | undefined;
  const arrayMessage = arrayError?.root?.message ?? arrayError?.message ?? null;

  return (
    <fieldset className="space-y-2" data-testid="audience-rules">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyPlaceholder}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((entry, index) => {
            const rowErrors = (
              (formContext.formState.errors as Record<string, unknown>)
                .audienceRules as
                | Array<
                    | {
                        audience?: { message?: string };
                        rule?: { message?: string };
                      }
                    | undefined
                  >
                | undefined
            )?.[index];
            return (
              <li key={`audience-row-${index}`} className="rounded-md border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-foreground">
                    <span>{audienceLabel}</span>
                    <input
                      type="text"
                      value={entry.audience}
                      maxLength={audienceMaxLength}
                      onChange={(event) => handleAudienceChange(index, event.target.value)}
                      aria-label={`${audienceLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {rowErrors?.audience?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.audience.message}
                      </span>
                    ) : null}
                  </label>
                  <label className="text-xs text-foreground">
                    <span>{ruleLabel}</span>
                    <input
                      type="text"
                      value={entry.rule}
                      maxLength={ruleMaxLength}
                      onChange={(event) => handleRuleChange(index, event.target.value)}
                      aria-label={`${ruleLabel} ${index + 1}`}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    {rowErrors?.rule?.message ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {rowErrors.rule.message}
                      </span>
                    ) : null}
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
