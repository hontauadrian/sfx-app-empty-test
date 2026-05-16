'use client';

import type { ReactNode } from 'react';
import { brandRoute } from '@/features/brand-profile';
import { DosAndDontEditForm } from '../../components/DosAndDontEditForm';
import { useEditDosAndDont } from './use-edit-dos-and-dont';
import { useEditDosAndDontNavigationHandler } from './use-edit-dos-and-dont-navigation-handler';
import type { EditDosAndDontPageProps } from './types';

export function EditDosAndDontPage({
  brandId,
  entryId,
}: EditDosAndDontPageProps): ReactNode {
  const overview = useEditDosAndDont(brandId, entryId);
  useEditDosAndDontNavigationHandler(
    brandId,
    overview.navigationTarget,
    overview.clearNavigationTarget,
  );

  if (overview.uiModel.isLoading) {
    return (
      <section className="p-8" aria-busy="true">
        <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  if (overview.uiModel.notFound) {
    return (
      <section className="mx-auto max-w-2xl space-y-3 p-8">
        <p className="text-destructive">{overview.uiModel.notFoundLabel}</p>
        <a
          href={brandRoute(brandId)}
          className="inline-block text-sm text-foreground underline"
        >
          {overview.uiModel.cancelLabel}
        </a>
      </section>
    );
  }

  if (overview.uiModel.hasError) {
    return (
      <section className="p-8">
        <p className="text-destructive">{overview.uiModel.errorLabel}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold text-foreground">
        {overview.uiModel.title}
      </h1>
      <DosAndDontEditForm
        defaultValues={overview.uiModel.defaultValues}
        translations={overview.uiModel.translations}
        isSubmitting={overview.isSubmitting}
        serverError={overview.uiModel.serverErrorLabel}
        submitLabel={overview.uiModel.submitLabel}
        cancelLabel={overview.uiModel.cancelLabel}
        onSubmit={overview.handleSubmit}
        onCancel={overview.handleCancel}
      />
    </section>
  );
}
