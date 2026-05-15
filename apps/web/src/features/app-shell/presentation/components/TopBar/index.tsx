'use client';

import type { ReactNode } from 'react';
import { ActiveBrandSelector } from '../ActiveBrandSelector';
import { BrandMark } from '../BrandMark';
import { UserMenu } from '../UserMenu';
import type { TopBarProps } from './types';

export function TopBar({
  brandMarkLabel,
  brandMarkHref,
  selectBrandLabel,
  currentBrandName,
  brandOptions,
  createBrandLabel,
  signOutLabel,
  signOutHref,
  email,
  onSelectBrand,
  onCreateBrand,
}: TopBarProps): ReactNode {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <BrandMark label={brandMarkLabel} href={brandMarkHref} />
      <ActiveBrandSelector
        selectLabel={selectBrandLabel}
        currentBrandName={currentBrandName}
        options={brandOptions}
        createBrandLabel={createBrandLabel}
        onSelect={onSelectBrand}
        onCreate={onCreateBrand}
      />
      <UserMenu email={email} signOutLabel={signOutLabel} signOutHref={signOutHref} />
    </header>
  );
}
