'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslations } from '@/features/presentation/localization';
import { useCompanyInfo } from './use-company-info';
import type {
  CompanyInfoDeniedUIModel,
  CompanyInfoFieldUIModel,
  CompanyInfoFormValues,
} from './types';

interface FieldShellProps {
  readonly field: CompanyInfoFieldUIModel;
  readonly errorMessage: string | undefined;
  readonly inputId: string;
  readonly children: ReactNode;
}

function FieldShell({ field, errorMessage, inputId, children }: FieldShellProps): ReactNode {
  const errorId = errorMessage ? `${field.name}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {field.label}
        {field.required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
      </label>
      {children}
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

interface FormFieldProps {
  readonly field: CompanyInfoFieldUIModel;
  readonly form: UseFormReturn<CompanyInfoFormValues>;
}

function TextField({ field, form }: FormFieldProps): ReactNode {
  const errorMessage = form.formState.errors[field.name]?.message as string | undefined;
  const errorId = errorMessage ? `${field.name}-error` : undefined;
  const inputId = `company-info-${field.name}`;
  const registration = form.register(field.name, {
    setValueAs: (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return value === null ? null : '';
      }
      if (field.name === 'legalName') return value;
      return value === '' ? null : value;
    },
  });

  return (
    <FieldShell field={field} errorMessage={errorMessage} inputId={inputId}>
      <input
        id={inputId}
        type={field.type}
        placeholder={field.placeholder}
        aria-invalid={errorMessage !== undefined}
        aria-describedby={errorId}
        aria-required={field.required || undefined}
        className="rounded-md border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...registration}
      />
    </FieldShell>
  );
}

const NUMERIC_BOUNDS: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
  foundedYear: { min: 1800, max: 2027 },
  teamSize: { min: 0, max: 1_000_000 },
};

function NumericField({ field, form }: FormFieldProps): ReactNode {
  const errorMessage = form.formState.errors[field.name]?.message as string | undefined;
  const errorId = errorMessage ? `${field.name}-error` : undefined;
  const inputId = `company-info-${field.name}`;
  const bounds = NUMERIC_BOUNDS[field.name];
  const registration = form.register(field.name, {
    setValueAs: (raw: unknown): number | null => {
      if (raw === null || raw === undefined || raw === '') return null;
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    },
  });

  return (
    <FieldShell field={field} errorMessage={errorMessage} inputId={inputId}>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        step="1"
        min={bounds?.min}
        max={bounds?.max}
        placeholder={field.placeholder}
        aria-invalid={errorMessage !== undefined}
        aria-describedby={errorId}
        aria-required={field.required || undefined}
        className="rounded-md border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...registration}
      />
    </FieldShell>
  );
}

function TextareaField({ field, form }: FormFieldProps): ReactNode {
  const errorMessage = form.formState.errors[field.name]?.message as string | undefined;
  const errorId = errorMessage ? `${field.name}-error` : undefined;
  const inputId = `company-info-${field.name}`;
  const registration = form.register(field.name, {
    setValueAs: (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return value === null ? null : '';
      }
      return value === '' ? null : value;
    },
  });

  return (
    <FieldShell field={field} errorMessage={errorMessage} inputId={inputId}>
      <textarea
        id={inputId}
        rows={4}
        maxLength={4000}
        placeholder={field.placeholder}
        aria-invalid={errorMessage !== undefined}
        aria-describedby={errorId}
        aria-required={field.required || undefined}
        className="rounded-md border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...registration}
      />
    </FieldShell>
  );
}

interface ArrayFieldProps {
  readonly field: CompanyInfoFieldUIModel;
  readonly form: UseFormReturn<CompanyInfoFormValues>;
  readonly addLabel: string;
  readonly removeLabel: string;
}

function ArrayField({ field, form, addLabel, removeLabel }: ArrayFieldProps): ReactNode {
  const fieldName = field.name as 'coreValues' | 'certifications';
  const watchedRaw = form.watch(fieldName) as readonly string[] | undefined;
  const items: readonly string[] = watchedRaw ?? [];
  const arrayError = form.formState.errors[fieldName] as
    | { message?: string; [key: number]: { message?: string } | undefined }
    | undefined;
  const topLevelError = typeof arrayError?.message === 'string' ? arrayError.message : undefined;
  const headingId = `company-info-${field.name}-label`;

  const addRow = (): void => {
    form.setValue(fieldName, [...items, ''], { shouldDirty: true });
  };

  const removeRow = (index: number): void => {
    const next = items.filter((_, i) => i !== index);
    form.setValue(fieldName, next, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="col-span-full flex flex-col gap-2">
      <span id={headingId} className="text-sm font-medium text-foreground">
        {field.label}
      </span>
      {topLevelError ? (
        <p role="alert" className="text-sm text-destructive">
          {topLevelError}
        </p>
      ) : null}
      <ul aria-labelledby={headingId} className="flex flex-col gap-2">
        {items.map((value, index) => {
          const itemError =
            arrayError && typeof arrayError === 'object' && arrayError[index]?.message
              ? arrayError[index]?.message
              : undefined;
          const inputId = `company-info-${field.name}-${index}`;
          const errorId = itemError ? `${field.name}-${index}-error` : undefined;
          const registration = form.register(`${fieldName}.${index}` as const, {
            setValueAs: (raw: unknown): string => (typeof raw === 'string' ? raw : ''),
          });
          return (
            <li key={`${field.name}-${index}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  id={inputId}
                  type="text"
                  defaultValue={value}
                  placeholder={field.placeholder}
                  aria-invalid={itemError !== undefined}
                  aria-describedby={errorId}
                  aria-label={`${field.label} ${index + 1}`}
                  className="min-h-11 flex-1 rounded-md border border-border bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...registration}
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`${removeLabel} ${index + 1}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {removeLabel}
                </button>
              </div>
              {itemError ? (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {itemError}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {addLabel}
      </button>
    </div>
  );
}

interface CompanyInfoSkeletonProps {
  readonly title: string;
}

function CompanyInfoSkeleton({ title }: CompanyInfoSkeletonProps): ReactNode {
  return (
    <main
      aria-busy="true"
      aria-label={title}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8"
    >
      <div className="h-8 w-1/2 animate-pulse rounded-lg bg-muted" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
    </main>
  );
}

interface DeniedSurfaceProps {
  readonly uiModel: CompanyInfoDeniedUIModel;
}

function DeniedSurface({ uiModel }: DeniedSurfaceProps): ReactNode {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <section className="max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
        <p className="mt-3 text-muted-foreground">{uiModel.message}</p>
        <a
          className="mt-5 inline-flex items-center rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={uiModel.backToHomeHref}
        >
          {uiModel.backToHomeLabel}
        </a>
      </section>
    </main>
  );
}

interface FieldRendererProps {
  readonly field: CompanyInfoFieldUIModel;
  readonly form: UseFormReturn<CompanyInfoFormValues>;
}

function FieldRenderer({ field, form }: FieldRendererProps): ReactNode {
  const translations = useTranslations('common');
  if (field.type === 'number') {
    return <NumericField field={field} form={form} />;
  }
  if (field.type === 'textarea') {
    return <TextareaField field={field} form={form} />;
  }
  if (field.type === 'array') {
    const addLabel =
      field.name === 'certifications'
        ? translations.adminCompanyInfo.cta.addCertification
        : translations.adminCompanyInfo.cta.addCoreValue;
    const removeLabel =
      field.name === 'certifications'
        ? translations.adminCompanyInfo.cta.removeCertification
        : translations.adminCompanyInfo.cta.removeCoreValue;
    return <ArrayField field={field} form={form} addLabel={addLabel} removeLabel={removeLabel} />;
  }
  return <TextField field={field} form={form} />;
}

export function CompanyInfoPage(): ReactNode {
  const { uiModel, form, handleSubmit } = useCompanyInfo();

  if (uiModel.status === 'loading') {
    return <CompanyInfoSkeleton title={uiModel.title} />;
  }

  if (uiModel.status === 'denied') {
    return <DeniedSurface uiModel={uiModel.denied} />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-foreground">{uiModel.title}</h1>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
        className="space-y-8"
      >
        {uiModel.sections.map((section) => (
          <fieldset
            key={section.key}
            className="space-y-3 rounded-md border border-border p-4"
          >
            <legend className="px-1 text-xl font-semibold text-foreground">{section.title}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <FieldRenderer key={field.name} field={field} form={form} />
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={uiModel.submit.disabled}
            aria-busy={uiModel.submit.pending || undefined}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uiModel.submit.label}
          </button>
          <Link
            href={uiModel.viewHistory.href}
            className="inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {uiModel.viewHistory.label}
          </Link>
        </div>
      </form>
    </main>
  );
}
