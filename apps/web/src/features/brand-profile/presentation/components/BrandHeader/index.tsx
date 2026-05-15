'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { BrandHeaderProps } from './types';

export function BrandHeader({
  brandName,
  settingsLabel,
  renameLabel,
  deleteLabel,
  onRename,
  onDelete,
}: BrandHeaderProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback((): void => {
    setIsOpen((current) => !current);
  }, []);

  const handleRenameClick = useCallback((): void => {
    setIsOpen(false);
    onRename();
  }, [onRename]);

  const handleDeleteClick = useCallback((): void => {
    setIsOpen(false);
    onDelete();
  }, [onDelete]);

  return (
    <header className="flex items-center justify-between">
      <h1 className="text-3xl font-bold text-foreground">{brandName}</h1>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={settingsLabel}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          onClick={handleToggle}
        >
          {settingsLabel}
        </button>
        {isOpen ? (
          <ul
            role="menu"
            className="absolute right-0 mt-2 w-44 overflow-hidden rounded-md border border-border bg-card text-sm shadow"
          >
            <li role="none">
              <button
                role="menuitem"
                type="button"
                className="block w-full px-4 py-2 text-left text-foreground hover:bg-muted"
                onClick={handleRenameClick}
              >
                {renameLabel}
              </button>
            </li>
            <li role="none">
              <button
                role="menuitem"
                type="button"
                className="block w-full px-4 py-2 text-left text-foreground hover:bg-muted"
                onClick={handleDeleteClick}
              >
                {deleteLabel}
              </button>
            </li>
          </ul>
        ) : null}
      </div>
    </header>
  );
}
