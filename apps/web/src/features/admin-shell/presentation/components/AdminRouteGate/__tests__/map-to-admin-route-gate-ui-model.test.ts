import { describe, expect, it } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import type { AuthSession } from '@/features/auth';
import { mapToAdminRouteGateUIModel } from '../map-to-admin-route-gate-ui-model';

const baseSession: AuthSession = {
  isAuthenticated: true,
  subject: 'user-1',
  email: 'user@example.com',
  roles: [],
  hasAppAccess: false,
};

describe('mapToAdminRouteGateUIModel', () => {
  it('returns loading status when the session query is loading', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: undefined,
      isLoading: true,
    });

    expect(model).toEqual({ status: 'loading' });
  });

  it('returns denied for an undefined session', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: undefined,
      isLoading: false,
    });

    expect(model.status).toBe('denied');
    if (model.status === 'denied') {
      expect(model.title).toBe(enCommon.admin.denied.title);
      expect(model.message).toBe(enCommon.admin.denied.message);
      expect(model.backToHomeLabel).toBe(enCommon.admin.denied.backToHome);
      expect(model.backToHomeHref).toBe('/');
    }
  });

  it('returns denied when session has no roles', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: { ...baseSession, roles: [] },
      isLoading: false,
    });

    expect(model.status).toBe('denied');
  });

  it('returns denied when session lacks the admin role', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: { ...baseSession, roles: ['viewer'], hasAppAccess: true },
      isLoading: false,
    });

    expect(model.status).toBe('denied');
  });

  it('returns allowed when session includes the admin role', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: { ...baseSession, roles: ['admin'], hasAppAccess: true },
      isLoading: false,
    });

    expect(model).toEqual({ status: 'allowed' });
  });

  it('returns allowed when admin is one of several roles', () => {
    const model = mapToAdminRouteGateUIModel({
      translations: enCommon,
      session: { ...baseSession, roles: ['viewer', 'admin'], hasAppAccess: true },
      isLoading: false,
    });

    expect(model).toEqual({ status: 'allowed' });
  });
});
