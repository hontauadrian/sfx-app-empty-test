'use client';

import type { ReactNode } from 'react';
import { BrandHeader } from '../../components/BrandHeader';
import { BrandVoiceCard } from '@/features/brand-voice';
import { VisualIdentityCardPlaceholder } from '../../components/VisualIdentityCardPlaceholder';
import { RenameBrandModal } from '../../components/RenameBrandModal';
import { DeleteBrandConfirmModal } from '../../components/DeleteBrandConfirmModal';
import { useBrandOverview } from './use-brand-overview';
import type { BrandOverviewPageProps } from './types';

export function BrandOverviewPage({ brandId }: BrandOverviewPageProps): ReactNode {
  const overview = useBrandOverview(brandId);
  const { uiModel } = overview;

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
    <section className="space-y-6 p-8">
      <BrandHeader
        brandName={uiModel.brandName}
        settingsLabel={uiModel.settingsLabel}
        renameLabel={uiModel.renameLabel}
        deleteLabel={uiModel.deleteLabel}
        onRename={overview.openRename}
        onDelete={overview.openDelete}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BrandVoiceCard brandId={brandId} />
        <VisualIdentityCardPlaceholder
          title={uiModel.visualIdentityTitle}
          ctaLabel={uiModel.visualIdentityCtaLabel}
          ctaHref={uiModel.visualIdentityCtaHref}
        />
      </div>
      {overview.isRenameOpen ? (
        <RenameBrandModal
          title={uiModel.renameModalTitle}
          nameLabel={uiModel.renameNameLabel}
          initialName={overview.initialName}
          submitLabel={uiModel.renameSubmitLabel}
          cancelLabel={uiModel.renameCancelLabel}
          nameRequiredError={uiModel.renameNameRequiredError}
          nameTooLongError={uiModel.renameNameTooLongError}
          isSubmitting={overview.isRenaming}
          onSubmit={overview.handleRenameSubmit}
          onCancel={overview.closeRename}
        />
      ) : null}
      {overview.isDeleteOpen ? (
        <DeleteBrandConfirmModal
          title={uiModel.deleteModalTitle}
          body={uiModel.deleteModalBody}
          confirmLabel={uiModel.deleteConfirmLabel}
          cancelLabel={uiModel.deleteCancelLabel}
          isSubmitting={overview.isDeleting}
          onConfirm={overview.handleDeleteConfirm}
          onCancel={overview.closeDelete}
        />
      ) : null}
    </section>
  );
}
