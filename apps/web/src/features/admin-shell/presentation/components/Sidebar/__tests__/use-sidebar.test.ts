import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

vi.mock('@/features/auth', () => ({
  useAuthSessionRepository: vi.fn(),
}));

import { usePathname } from 'next/navigation';
import { useTranslations } from '@/features/presentation/localization';
import { useAuthSessionRepository } from '@/features/auth';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { useSidebar } from '../use-sidebar';

describe('useSidebar', () => {
  beforeEach(() => {
    vi.mocked(useTranslations).mockReturnValue(enCommon);
    vi.mocked(usePathname).mockReturnValue('/');
  });

  it('returns hidden when the user is unauthenticated', () => {
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);
    const { result } = renderHook(() => useSidebar());
    expect(result.current.uiModel.status).toBe('hidden');
  });

  it('returns visible for an authenticated admin with both entries', () => {
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: {
        isAuthenticated: true,
        subject: 'u',
        email: 'a@b.com',
        roles: ['admin'],
        hasAppAccess: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);

    const { result } = renderHook(() => useSidebar());
    expect(result.current.uiModel.status).toBe('visible');
    if (result.current.uiModel.status === 'visible') {
      expect(result.current.uiModel.items.map((item) => item.key)).toEqual(['home', 'admin']);
    }
  });

  it('defaults pathname to / when usePathname returns null', () => {
    vi.mocked(usePathname).mockReturnValue(null as unknown as string);
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: {
        isAuthenticated: true,
        subject: 'u',
        email: 'a@b.com',
        roles: ['admin'],
        hasAppAccess: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);
    const { result } = renderHook(() => useSidebar());
    if (result.current.uiModel.status !== 'visible') throw new Error('expected visible');
    expect(result.current.uiModel.items[0]?.isActive).toBe(true);
  });
});
