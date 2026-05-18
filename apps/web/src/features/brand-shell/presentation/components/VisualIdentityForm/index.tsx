'use client';

import { type ReactNode } from 'react';
import { useFieldArray } from 'react-hook-form';
import { useVisualIdentityForm } from './use-visual-identity-form';
import { ViewHistoryLink } from '../ViewHistoryLink';
import type { VisualIdentityFormProps } from './types';

export function VisualIdentityForm(props: VisualIdentityFormProps): ReactNode {
  const { uiModel, form, handleSubmit } = useVisualIdentityForm(
    props.brandId,
    props.onDirtyChange,
  );

  if (uiModel.status === 'loading') {
    return (
      <section
        aria-busy="true"
        data-testid="visual-identity-form-loading"
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
        <ViewHistoryLink brandId={props.brandId} section="visual" />
      </div>
      <form
        data-testid="visual-identity-form"
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
          <legend className="text-sm font-medium text-foreground">{uiModel.sections.logo}</legend>
          <label htmlFor="visual-logo-usage" className="text-sm text-muted-foreground">
            {uiModel.fields.logoUsage.label}
          </label>
          <textarea
            id="visual-logo-usage"
            rows={3}
            aria-invalid={form.formState.errors.logoUsage ? true : undefined}
            className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-foreground"
            {...form.register('logoUsage')}
          />
          {form.formState.errors.logoUsage?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {String(form.formState.errors.logoUsage.message)}
            </p>
          ) : null}
        </fieldset>

        <PaletteField
          form={form}
          legend={uiModel.sections.colorPalette}
          nameLabel={uiModel.fields.paletteName.label}
          hexLabel={uiModel.fields.paletteHex.label}
          notesLabel={uiModel.fields.paletteUsage.label}
          addLabel={uiModel.cta.addPaletteEntry}
          removeLabel={uiModel.cta.removePaletteEntry}
        />

        <TypographyField
          form={form}
          legend={uiModel.sections.typography}
          fontLabel={uiModel.fields.typographyFont.label}
          weightLabel={uiModel.fields.typographyWeight.label}
          contextLabel={uiModel.fields.typographyContext.label}
          addLabel={uiModel.cta.addTypographyEntry}
          removeLabel={uiModel.cta.removeTypographyEntry}
        />

        <TextareaSection
          form={form}
          fieldName="spacingGuidance"
          legend={uiModel.sections.spacing}
          itemLabel={uiModel.fields.spacingGuidance.label}
        />
        <TextareaSection
          form={form}
          fieldName="imageStyleGuidance"
          legend={uiModel.sections.imageStyle}
          itemLabel={uiModel.fields.imageStyleGuidance.label}
        />
        <TextareaSection
          form={form}
          fieldName="iconographyGuidance"
          legend={uiModel.sections.iconography}
          itemLabel={uiModel.fields.iconographyGuidance.label}
        />
        <TextareaSection
          form={form}
          fieldName="usageRestrictions"
          legend={uiModel.sections.restrictions}
          itemLabel={uiModel.fields.usageRestrictions.label}
        />

        <div>
          <button
            type="submit"
            data-testid="visual-identity-submit"
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

type FormHandle = ReturnType<typeof useVisualIdentityForm>['form'];

interface PaletteFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly nameLabel: string;
  readonly hexLabel: string;
  readonly notesLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function PaletteField(props: PaletteFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'colorPalette',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-3">
        {fields.map((row, index) => {
          const hexError = (
            props.form.formState.errors.colorPalette as
              | Array<{ hex?: { message?: string } } | undefined>
              | undefined
          )?.[index]?.hex?.message;
          return (
            <li
              key={row.id}
              className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-3"
            >
              <input
                type="text"
                aria-label={`${props.nameLabel} ${index + 1}`}
                placeholder={props.nameLabel}
                className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                {...props.form.register(`colorPalette.${index}.name` as const)}
              />
              <input
                type="text"
                aria-label={`${props.hexLabel} ${index + 1}`}
                placeholder={props.hexLabel}
                aria-invalid={hexError ? true : undefined}
                className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                {...props.form.register(`colorPalette.${index}.hex` as const)}
              />
              <input
                type="text"
                aria-label={`${props.notesLabel} ${index + 1}`}
                placeholder={props.notesLabel}
                className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
                {...props.form.register(`colorPalette.${index}.usageNotes` as const, {
                  setValueAs: (raw: unknown): string | null =>
                    typeof raw === 'string' && raw.length > 0 ? raw : null,
                })}
              />
              {hexError ? (
                <p role="alert" className="col-span-full text-sm text-destructive">
                  {hexError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`${props.removeLabel} ${index + 1}`}
                className="col-span-full min-h-11 self-start rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                {props.removeLabel}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => append({ name: '', hex: '', usageNotes: null })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface TypographyFieldProps {
  readonly form: FormHandle;
  readonly legend: string;
  readonly fontLabel: string;
  readonly weightLabel: string;
  readonly contextLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function TypographyField(props: TypographyFieldProps): ReactNode {
  const { fields, append, remove } = useFieldArray({
    control: props.form.control,
    name: 'typography',
  });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <ul className="flex flex-col gap-3">
        {fields.map((row, index) => (
          <li
            key={row.id}
            className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-3"
          >
            <input
              type="text"
              aria-label={`${props.fontLabel} ${index + 1}`}
              placeholder={props.fontLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`typography.${index}.font` as const)}
            />
            <input
              type="text"
              aria-label={`${props.weightLabel} ${index + 1}`}
              placeholder={props.weightLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`typography.${index}.weight` as const)}
            />
            <input
              type="text"
              aria-label={`${props.contextLabel} ${index + 1}`}
              placeholder={props.contextLabel}
              className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-foreground"
              {...props.form.register(`typography.${index}.usageContext` as const, {
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
        onClick={() => append({ font: '', weight: '', usageContext: null })}
        className="min-h-11 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
      >
        {props.addLabel}
      </button>
    </fieldset>
  );
}

interface TextareaSectionProps {
  readonly form: FormHandle;
  readonly fieldName:
    | 'spacingGuidance'
    | 'imageStyleGuidance'
    | 'iconographyGuidance'
    | 'usageRestrictions';
  readonly legend: string;
  readonly itemLabel: string;
}

function TextareaSection(props: TextareaSectionProps): ReactNode {
  const inputId = `visual-${props.fieldName}`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{props.legend}</legend>
      <label htmlFor={inputId} className="text-sm text-muted-foreground">
        {props.itemLabel}
      </label>
      <textarea
        id={inputId}
        rows={3}
        className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-foreground"
        {...props.form.register(props.fieldName, {
          setValueAs: (raw: unknown): string => (typeof raw === 'string' ? raw : ''),
        })}
      />
    </fieldset>
  );
}
