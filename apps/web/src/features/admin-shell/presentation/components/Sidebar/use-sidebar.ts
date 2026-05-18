'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useAuthSessionRepository } from '@/features/auth';
import { mapToSidebarUIModel } from './map-to-sidebar-ui-model';
import type { UseSidebarReturn } from './types';

export function useSidebar(): UseSidebarReturn {
  const translations = useTranslations('common');
  const { data: session, isLoading } = useAuthSessionRepository();
  const pathname = usePathname() ?? '/';
  const uiModel = mapToSidebarUIModel({ translations, session, isLoading, pathname });
  return { uiModel };
}
