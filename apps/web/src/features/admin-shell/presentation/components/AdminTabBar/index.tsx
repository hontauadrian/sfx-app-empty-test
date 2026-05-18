'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAdminTabBar } from './use-admin-tab-bar';
import type { AdminTabBarItem, AdminTabBarProps } from './types';

function tabItemClassName(item: AdminTabBarItem): string {
  const base =
    'inline-flex items-center rounded-md px-4 py-2 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors';
  return item.isActive
    ? `${base} bg-muted text-foreground border-b-2 border-primary`
    : `${base} text-muted-foreground hover:bg-muted hover:text-foreground`;
}

export function AdminTabBar({ registry }: AdminTabBarProps = {}): ReactNode {
  const { uiModel } = useAdminTabBar(registry);

  return (
    <nav
      aria-label={uiModel.navAriaLabel}
      className="border-b border-border bg-background"
    >
      <ul className="flex gap-2 px-4">
        {uiModel.items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.isActive ? 'page' : undefined}
              className={tabItemClassName(item)}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
