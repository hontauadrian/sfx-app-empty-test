'use client';

import type { ReactNode } from 'react';
import type { LeftNavProps } from './types';

export function LeftNav({ items, ariaLabel }: LeftNavProps): ReactNode {
  return (
    <nav aria-label={ariaLabel} className="w-56 border-r border-border bg-card p-4">
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item.key}>
            <a
              href={item.href}
              className="block rounded-md px-3 py-2 text-foreground hover:bg-muted"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
