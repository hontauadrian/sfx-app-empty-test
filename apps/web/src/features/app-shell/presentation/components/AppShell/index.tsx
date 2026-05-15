'use client';

import type { ReactNode } from 'react';
import { LeftNav } from '../LeftNav';
import { TopBar } from '../TopBar';
import type { AppShellProps } from './types';
import { useAppShell } from './use-app-shell';

export function AppShell({ children }: AppShellProps): ReactNode {
  const { uiModel, handleSelectBrand, handleCreateBrand } = useAppShell();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar
        brandMarkLabel={uiModel.brandMarkLabel}
        brandMarkHref={uiModel.brandMarkHref}
        selectBrandLabel={uiModel.selectBrandLabel}
        currentBrandName={uiModel.currentBrandName}
        brandOptions={uiModel.brandOptions}
        createBrandLabel={uiModel.createBrandLabel}
        signOutLabel={uiModel.signOutLabel}
        signOutHref={uiModel.signOutHref}
        email={uiModel.email}
        onSelectBrand={handleSelectBrand}
        onCreateBrand={handleCreateBrand}
      />
      <div className="flex flex-1">
        {uiModel.leftNavItems ? (
          <LeftNav items={uiModel.leftNavItems} ariaLabel={uiModel.leftNavLabel} />
        ) : null}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
