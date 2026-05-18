'use client';

import { type ReactNode } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useBrandVoiceForm } from './use-brand-voice-form';
import { ViewHistoryLink } from '../ViewHistoryLink';
import type { BrandVoiceFormProps } from './types';

export function BrandVoiceForm(props: BrandVoiceFormProps): ReactNode {
  const { uiModel, form, handleSubmit } = useBrandVoiceForm(
    props.brandId,
    props.onDirtyChange,
  );

  if (uiModel.status === 'loading') {
    return (
      <section
        aria-busy="true"
        data-testid="brand-voice-form-loading"
        className="rounded-lg border border-border bg-card p-6"
      >
        <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-24 w-full animate-pulse rounded bg-muted" />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{uiModel.pageTitle}</h2>
        <ViewHistoryLink brandId={props.brandId} section="voice" />
      </div>
      <form
        data-testid="brand-voice-form"
        onSubmit={handleSubmit}
        noValidate
        className="mt-4 flex flex-col gap-6"
      >
        {uiModel.formError ? (
          <p role="alert" className="text-sm text-destructive">
            {uiModel.formError}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">
            {uiModel.sections.tone}
          </legend>
          <label htmlFor="brand-voice-tone" className="text-sm text-muted-foreground">
            {uiModel.fields.tone.label}
          </label>
          <textarea
            id="brand-voice-tone"
            rows={3}
            placeholder={uiModel.fields.tone.placeholder ?? ''}
            aria-invalid={form.formState.errors.tone ? true : undefined}
            className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-foreground"
            {...form.register('tone')}
          />
          {form.formState.errors.tone?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {String(form.formState.errors.tone.message)}
            </p>
          ) : null}
        </fieldset>

        <StringListField
          form={form}
          fieldName="preferredVocabulary"
          legend={uiModel.sections.preferredVocabulary}
          itemLabel={uiModel.fields.preferredVocabulary.label}
          addLabel={uiModel.cta.addPreferred}
          removeLabel={uiModel.cta.removePreferred}
        />

        <StringListField
          form={form}
          fieldName="restrictedVocabulary"
          legend={uiModel.sections.restrictedVocabulary}
          itemLabel={uiModel.fields.restrictedVocabulary.label}
          addLabel={uiModel.cta.addRestricted}
          removeLabel={uiModel.cta.removeRestricted}
        />

        <PillarsField
          form={form}
          legend={uiModel.sections.messagingPillars}
          titleLabel={uiModel.fields.messagingPillarTitle.label}
          descriptionLabel={uiModel.fields.messagingPillarDescription.label}
          addLabel={uiModel.cta.addPillar}
          removeLabel={uiModel.cta.removePillar}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-foreground">
            {uiModel.sections.writingStyle}
          </legend>
          <label htmlFor="brand-voice-writing-style" className="text-sm text-muted-foreground">
            {uiModel.fields.writingStyleRules.label}
          </label>
          <textarea
            id="brand-voice-writing-style"
            rows={4}
            className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-foreground"
            {...form.register('writingStyleRules', {
              setValueAs: (raw: unknown): string => (typeof raw === 'string' ? raw : ''),
            })}
          />
        </fieldset>

        <AudienceRulesField
          form={form}
          legend={uiModel.sections.audienceRules}
          audienceLabel={uiModel.fields.audienceRulesAudience.label}
          rulesLabel={uiModel.fields.audienceRulesRules.label}
          addLabel={uiModel.cta.addAudienceRule}
          removeLabel={uiModel.cta.removeAudienceRule}
        />

        <ApprovedExamplesField
          form={form}
          legend={uiModel.sections.approvedExamples}
          phraseLabel={uiModel.fields.approvedExamplePhrase.label}
          addLabel={uiModel.cta.addApprovedExample}
          removeLabel={uiModel.cta.removeApprovedExample}
        />

        <RejectedExamplesField
          form={form}
          legend={uiModel.sections.rejectedExamples}
          phraseLabel={uiModel.fields.rejectedExamplePhrase.label}
          reasonLabel={uiModel.fields.rejectedExampleReason.label}
          addLabel={uiModel.cta.addRejectedExample}
          removeLabel={uiModel.cta.removeRejectedExample}
        />

        <div>
          <button
            type="submit"
            data-testid="brand-voice-submit"
            disabled={uiModel.submitDisabled}
            aria-busy={uiModel.isSubmitting ? true : undefined}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {uiModel.submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}

type FormHandle = ReturnType<typeof useBrandVoiceForm>['form'];

interface StringListFieldProps {
  readonly form: FormHandle;
  readonly fieldName: 'preferredVocabulary' | 'restrictedVocabulary';
  readonly legend: string;
  readonly itemLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function StringListField(props: StringListFieldProps): ReactNode {
  const items = (props.form.watch(props.fieldName) ?? []) as readonly string[];
  const addRow = (): void => {
    props.form.setValue(props.fieldName, [...items, ''], { shouldDirty: true });
  };
  const removeRow = (index: number): void => {
    props.form.setValue(
      props.fieldName,
      items.filter((_value, current) => current !== index),
      { shouldDirty: true, shouldValidate: true },
    );
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-2">
        {items.map((value, index) => (
          <li key={`${props.fieldName}-${index}`} className="flex items-center gap-2">
            <input
              type="text"
              defaultValue={value}
              aria-label={`${props.itemLabel} ${index + 1}`}
              className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`${props.fieldName}.${index}` as const, {
                setValueAs: (raw: unknown): string => (typeof raw === 'string' ? raw : ''),
              })}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              aria-label={`${props.removeLabel} ${index + 1}`}
              className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {props.removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={addRow}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface PillarsFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly titleLabel: string;
  readonly descriptionLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function PillarsField(props: PillarsFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'messagingPillars',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-3">
        {fields.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <input
              type="text"
              aria-label={`${props.titleLabel} ${index + 1}`}
              placeholder={props.titleLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`messagingPillars.${index}.title` as const)}
            />
            <input
              type="text"
              aria-label={`${props.descriptionLabel} ${index + 1}`}
              placeholder={props.descriptionLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`messagingPillars.${index}.description` as const)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`${props.removeLabel} ${index + 1}`}
              className="col-span-full min-h-11 self-start rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {props.removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => append({ title: '', description: '' })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface AudienceRulesFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly audienceLabel: string;
  readonly rulesLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function AudienceRulesField(props: AudienceRulesFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'audienceRules',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-3">
        {fields.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <input
              type="text"
              aria-label={`${props.audienceLabel} ${index + 1}`}
              placeholder={props.audienceLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`audienceRules.${index}.audience` as const)}
            />
            <input
              type="text"
              aria-label={`${props.rulesLabel} ${index + 1}`}
              placeholder={props.rulesLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`audienceRules.${index}.rules` as const)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`${props.removeLabel} ${index + 1}`}
              className="col-span-full min-h-11 self-start rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {props.removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => append({ audience: '', rules: '' })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface ApprovedExamplesFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly phraseLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function ApprovedExamplesField(props: ApprovedExamplesFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'approvedExamples',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-2">
        {fields.map((row, index) => (
          <li key={row.id} className="flex items-center gap-2">
            <input
              type="text"
              aria-label={`${props.phraseLabel} ${index + 1}`}
              placeholder={props.phraseLabel}
              className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`approvedExamples.${index}.phrase` as const)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`${props.removeLabel} ${index + 1}`}
              className="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {props.removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => append({ phrase: '' })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface RejectedExamplesFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly phraseLabel: string;
  readonly reasonLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function RejectedExamplesField(props: RejectedExamplesFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'rejectedExamples',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-3">
        {fields.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <input
              type="text"
              aria-label={`${props.phraseLabel} ${index + 1}`}
              placeholder={props.phraseLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`rejectedExamples.${index}.phrase` as const)}
            />
            <input
              type="text"
              aria-label={`${props.reasonLabel} ${index + 1}`}
              placeholder={props.reasonLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`rejectedExamples.${index}.reason` as const, {
                setValueAs: (raw: unknown): string | null =>
                  typeof raw === 'string' && raw.length > 0 ? raw : null,
              })}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`${props.removeLabel} ${index + 1}`}
              className="col-span-full min-h-11 self-start rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {props.removeLabel}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => append({ phrase: '', reason: null })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}
