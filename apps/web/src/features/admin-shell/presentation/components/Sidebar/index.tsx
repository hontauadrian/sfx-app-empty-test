'use client';

import type { ReactNode } from 'react';
import { useSidebar } from './use-sidebar';
import type { SidebarNavItem } from './types';

function navItemClassName(item: SidebarNavItem): string {
  const base =
    'flex items-center rounded-md px-3 py-2 font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return item.isActive ? `${base} bg-muted` : base;
}

export function Sidebar(): ReactNode {
  const { uiModel } = useSidebar();

  if (uiModel.status === 'hidden') {
    return null;
  }

  if (uiModel.status === 'loading') {
    return (
      <aside
        aria-busy="true"
        className="w-56 shrink-0 border-r border-border bg-background p-4"
      >
        <div aria-hidden="true" className="h-8 w-full animate-pulse rounded bg-muted" />
        <div
          aria-hidden="true"
          className="mt-2 h-8 w-full animate-pulse rounded bg-muted"
        />
      </aside>
    );
  }

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-background p-4">
      <nav aria-label={uiModel.navAriaLabel}>
        <ul className="flex flex-col gap-1">
          {uiModel.items.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                className={navItemClassName(item)}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
