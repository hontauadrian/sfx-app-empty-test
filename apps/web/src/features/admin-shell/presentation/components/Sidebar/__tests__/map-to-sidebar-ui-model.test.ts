import { describe, expect, it } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import type { AuthSession } from '@/features/auth';
import { mapToSidebarUIModel } from '../map-to-sidebar-ui-model';

function authedSession(roles: string[]): AuthSession {
  return {
    isAuthenticated: true,
    subject: 'user-1',
    email: 'user@example.com',
    roles,
    hasAppAccess: roles.length > 0,
  };
}

describe('mapToSidebarUIModel', () => {
  it('returns loading when the session query is loading', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: undefined,
      isLoading: true,
      pathname: '/',
    });
    expect(model).toEqual({ status: 'loading' });
  });

  it('returns hidden when the session is undefined', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: undefined,
      isLoading: false,
      pathname: '/',
    });
    expect(model).toEqual({ status: 'hidden' });
  });

  it('returns hidden when the session is unauthenticated', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: {
        isAuthenticated: false,
        subject: '',
        email: null,
        roles: [],
        hasAppAccess: false,
      },
      isLoading: false,
      pathname: '/',
    });
    expect(model).toEqual({ status: 'hidden' });
  });

  it('returns the home-only nav for an authenticated non-admin', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['viewer']),
      isLoading: false,
      pathname: '/',
    });
    expect(model.status).toBe('visible');
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({ key: 'home', isActive: true, href: '/' });
  });

  it('marks home as inactive for a non-admin on a non-home pathname', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['viewer']),
      isLoading: false,
      pathname: '/some/other/path',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[0]?.isActive).toBe(false);
  });

  it('includes admin entry for an admin and marks home active on /', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items.map((item) => item.key)).toEqual(['home', 'admin']);
    expect(model.items[0]?.isActive).toBe(true);
    expect(model.items[1]?.isActive).toBe(false);
  });

  it('marks admin active on /admin exactly', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/admin',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[1]?.isActive).toBe(true);
  });

  it('marks admin active on /admin/<sub>', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/admin/company-info',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[1]?.isActive).toBe(true);
  });

  it('does NOT mark admin active on /administration (no naive startsWith)', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/administration',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[1]?.isActive).toBe(false);
  });

  it('marks home active only on exact /', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/admin',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[0]?.isActive).toBe(false);
  });

  it('omits the admin entry for a viewer-only role', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['viewer']),
      isLoading: false,
      pathname: '/',
    });
    if (model.status === 'visible') {
      expect(model.items.find((item) => item.key === 'admin')).toBeUndefined();
    }
  });

  it('includes the admin entry when admin is one of several roles', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['viewer', 'admin']),
      isLoading: false,
      pathname: '/',
    });
    if (model.status === 'visible') {
      expect(model.items.find((item) => item.key === 'admin')).toBeDefined();
    }
  });

  it('uses labels from translations.nav.*', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[0]?.label).toBe(enCommon.nav.home);
    expect(model.items[1]?.label).toBe(enCommon.nav.admin);
  });

  it('uses stable keys home and admin', () => {
    const model = mapToSidebarUIModel({
      translations: enCommon,
      session: authedSession(['admin']),
      isLoading: false,
      pathname: '/',
    });
    if (model.status !== 'visible') throw new Error('expected visible');
    expect(model.items[0]?.key).toBe('home');
    expect(model.items[1]?.key).toBe('admin');
  });
});
