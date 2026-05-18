import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

import { usePathname } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { common as roCommon } from '@/features/presentation/localization/languages/ro/common';
import { ADMIN_TAB_REGISTRY, type AdminTab } from '../../../../constants';
import { useAdminTabBar } from '../use-admin-tab-bar';

describe('useAdminTabBar', () => {
  beforeEach(() => {
    vi.mocked(useTranslations).mockReturnValue(enCommon);
    vi.mocked(usePathname).mockReturnValue('/admin/company-info');
  });

  it('returns a uiModel reflecting the default ADMIN_TAB_REGISTRY', () => {
    const { result } = renderHook(() => useAdminTabBar());
    expect(result.current.uiModel.items).toHaveLength(ADMIN_TAB_REGISTRY.length);
    expect(result.current.uiModel.items[0]?.key).toBe('companyInfo');
    expect(result.current.uiModel.items[0]?.isActive).toBe(true);
  });

  it('returns Romanian labels when LanguageProvider yields roCommon', () => {
    vi.mocked(useTranslations).mockReturnValue(roCommon);
    const { result } = renderHook(() => useAdminTabBar());
    expect(result.current.uiModel.items[0]?.label).toBe(roCommon.admin.tabs.companyInfo);
  });

  it("falls back to '/' when usePathname returns null", () => {
    vi.mocked(usePathname).mockReturnValue(null as unknown as string);
    const { result } = renderHook(() => useAdminTabBar());
    expect(result.current.uiModel.items[0]?.isActive).toBe(false);
  });

  it('accepts a custom registry argument', () => {
    const customRegistry: readonly AdminTab[] = [
      {
        id: 'companyInfo',
        labelKey: 'companyInfo',
        href: '/admin/company-info',
        isActive: () => false,
      },
      {
        id: 'companyInfo',
        labelKey: 'companyInfo',
        href: '/admin/users',
        isActive: () => true,
      },
    ];
    const { result } = renderHook(() => useAdminTabBar(customRegistry));
    expect(result.current.uiModel.items).toHaveLength(2);
    expect(result.current.uiModel.items[1]?.isActive).toBe(true);
  });
});
