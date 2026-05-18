'use client';

import type { ReactNode } from 'react';
import { CreateBrandModal } from '../CreateBrandModal';
import { RenameBrandDialog } from '../RenameBrandDialog';
import { DeleteBrandConfirm } from '../DeleteBrandConfirm';
import { useBrandProfileSelector } from './use-brand-profile-selector';
import type { BrandProfileSelectorProps } from './types';

export function BrandProfileSelector(props: BrandProfileSelectorProps): ReactNode {
  const {
    uiModel,
    createOpen,
    renameOpen,
    deleteOpen,
    activeBrand,
    handleSelectChange,
    handleOpenRename,
    handleOpenDelete,
    handleCloseCreate,
    handleCloseRename,
    handleCloseDelete,
    handleCreated,
    handleRenamed,
    handleDeleted,
  } = useBrandProfileSelector(props);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label
          htmlFor="brand-profile-selector"
          className="text-sm font-medium text-foreground"
        >
          {uiModel.label}
        </label>
        <select
          id="brand-profile-selector"
          value={uiModel.activeBrandId ?? ''}
          onChange={(event) => handleSelectChange(event.target.value)}
          aria-label={uiModel.label}
          className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {uiModel.activeBrandId === null ? (
            <option value="" disabled>
              {uiModel.placeholder}
            </option>
          ) : null}
          {uiModel.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value={uiModel.createOptionValue}>{uiModel.createOptionLabel}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={handleOpenRename}
        disabled={uiModel.renameDisabled}
        className="min-h-11 rounded-md border border-border px-4 py-2 font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        {uiModel.renameLabel}
      </button>
      <button
        type="button"
        onClick={handleOpenDelete}
        disabled={uiModel.deleteDisabled}
        className="min-h-11 rounded-md border border-destructive px-4 py-2 font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        {uiModel.deleteLabel}
      </button>

      <CreateBrandModal
        open={createOpen}
        onClose={handleCloseCreate}
        onCreated={handleCreated}
      />
      <RenameBrandDialog
        open={renameOpen}
        brand={activeBrand}
        onClose={handleCloseRename}
        onRenamed={handleRenamed}
      />
      <DeleteBrandConfirm
        open={deleteOpen}
        brand={activeBrand}
        onClose={handleCloseDelete}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
