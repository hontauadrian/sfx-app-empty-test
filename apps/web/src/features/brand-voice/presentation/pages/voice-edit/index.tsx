'use client';

import type { ReactNode } from 'react';
import { VoiceEditForm } from '../../components/VoiceEditForm';
import { useVoiceEdit } from './use-voice-edit';
import { useVoiceEditNavigationHandler } from './use-voice-edit-navigation-handler';
import type { VoiceEditPageProps } from './types';

export function VoiceEditPage({ brandId }: VoiceEditPageProps): ReactNode {
  const {
    uiModel,
    handleSubmit,
    handleCancel,
    navigationTarget,
    clearNavigationTarget,
    isSubmitting,
  } = useVoiceEdit(brandId);

  useVoiceEditNavigationHandler(brandId, navigationTarget, clearNavigationTarget);

  if (uiModel.isLoading) {
    return (
      <section className="p-8" aria-busy="true">
        <div className="h-32 w-full max-w-md animate-pulse rounded-lg bg-muted" />
      </section>
    );
  }

  if (uiModel.notFound) {
    return (
      <section className="p-8">
        <p className="text-destructive">404</p>
      </section>
    );
  }

  if (uiModel.hasError) {
    return (
      <section className="p-8">
        <p className="text-destructive">{uiModel.errorLabel}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold text-foreground">{uiModel.title}</h1>
      <VoiceEditForm
        defaultValues={uiModel.defaultValues}
        translations={uiModel.translations}
        isSubmitting={isSubmitting}
        serverError={uiModel.serverErrorLabel}
        saveLabel={uiModel.saveLabel}
        cancelLabel={uiModel.cancelLabel}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </section>
  );
}
