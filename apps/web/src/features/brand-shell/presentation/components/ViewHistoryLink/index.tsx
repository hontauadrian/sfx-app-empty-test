'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/features/presentation/localization';
import type { ViewHistoryLinkProps } from './types';

export function ViewHistoryLink(props: ViewHistoryLinkProps): ReactNode {
  const translations = useTranslations('common');
  const label = translations.adminBrandGuidelines.history?.viewHistoryCta ?? 'View history';
  const href = `/admin/brand-guidelines/${props.brandId}/history`;
  return (
    <Link
      href={href}
      data-testid={`view-history-link-${props.section}`}
      className="inline-flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
    >
      {label}
    </Link>
  );
}
