'use client';

import type { ReactNode } from 'react';
import { DosAndDontEditForm } from '../../components/DosAndDontEditForm';
import { useNewDosAndDont } from './use-new-dos-and-dont';
import { useNewDosAndDontNavigationHandler } from './use-new-dos-and-dont-navigation-handler';
import type { NewDosAndDontPageProps } from './types';

export function NewDosAndDontPage({ brandId }: NewDosAndDontPageProps): ReactNode {
  const overview = useNewDosAndDont(brandId);
  useNewDosAndDontNavigationHandler(
    brandId,
    overview.navigationTarget,
    overview.clearNavigationTarget,
  );

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
