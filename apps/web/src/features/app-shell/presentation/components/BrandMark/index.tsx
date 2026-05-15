'use client';

import type { ReactNode } from 'react';
import type { BrandMarkProps } from './types';

export function BrandMark({ label, href }: BrandMarkProps): ReactNode {
  return (
    <a
      href={href}
      className="text-lg font-bold text-foreground"
      aria-label={label}
    >
      {label}
    </a>
  );
}
