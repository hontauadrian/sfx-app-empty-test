import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

vi.mock('@/features/auth', () => ({
  useAuthSessionRepository: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useAuthSessionRepository } from '@/features/auth';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { useAdminRouteGate } from '../use-admin-route-gate';

describe('useAdminRouteGate', () => {
  beforeEach(() => {
    vi.mocked(useTranslations).mockReturnValue(enCommon);
  });

  it('returns loading uiModel when the session query is loading', () => {
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);

    const { result } = renderHook(() => useAdminRouteGate());
    expect(result.current.uiModel).toEqual({ status: 'loading' });
  });

  it('returns allowed uiModel when the session includes the admin role', () => {
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: {
        isAuthenticated: true,
        subject: 'user-1',
        email: 'admin@example.com',
        roles: ['admin'],
        hasAppAccess: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);

    const { result } = renderHook(() => useAdminRouteGate());
    expect(result.current.uiModel).toEqual({ status: 'allowed' });
  });

  it('returns denied uiModel sourcing labels from translations', () => {
    vi.mocked(useAuthSessionRepository).mockReturnValue({
      data: {
        isAuthenticated: true,
        subject: 'user-1',
        email: 'user@example.com',
        roles: ['viewer'],
        hasAppAccess: true,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useAuthSessionRepository>);

    const { result } = renderHook(() => useAdminRouteGate());
    const model = result.current.uiModel;
    expect(model.status).toBe('denied');
    if (model.status === 'denied') {
      expect(model.title).toBe(enCommon.admin.denied.title);
      expect(model.backToHomeHref).toBe('/');
    }
  });
});
