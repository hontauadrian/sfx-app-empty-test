'use client';

import { useCallback, useState, type ReactNode } from 'react';
import type { UserMenuProps } from './types';

export function UserMenu({ email, signOutLabel, signOutHref }: UserMenuProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback((): void => {
    setIsOpen((current) => !current);
  }, []);

  const label = email ?? signOutLabel;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={signOutLabel}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        onClick={handleToggle}
      >
        {label}
      </button>
      {isOpen ? (
        <ul
          role="menu"
          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-border bg-card text-sm shadow"
        >
          <li role="none">
            <a
              role="menuitem"
              href={signOutHref}
              className="block px-4 py-2 text-foreground hover:bg-muted"
            >
              {signOutLabel}
            </a>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
