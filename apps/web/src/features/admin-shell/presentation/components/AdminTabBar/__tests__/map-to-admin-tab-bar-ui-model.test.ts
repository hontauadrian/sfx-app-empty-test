import { describe, expect, it } from 'vitest';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { common as roCommon } from '@/features/presentation/localization/languages/ro/common';
import { ADMIN_TAB_REGISTRY, type AdminTab } from '../../../../constants';
import { mapToAdminTabBarUIModel } from '../map-to-admin-tab-bar-ui-model';

describe('mapToAdminTabBarUIModel', () => {
  it('maps each registry entry to a UI item with key, label, href, isActive', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/company-info',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items).toHaveLength(ADMIN_TAB_REGISTRY.length);
    const first = model.items[0];
    if (!first) throw new Error('expected first item');
    expect(first.key).toBe('companyInfo');
    expect(first.label).toBe(enCommon.admin.tabs.companyInfo);
    expect(first.href).toBe('/admin/company-info');
    expect(first.isActive).toBe(true);
  });

  it('marks companyInfo active on /admin (pre-redirect)', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(true);
  });

  it('marks companyInfo active on /admin/company-info', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/company-info',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(true);
  });

  it('marks companyInfo active on /admin/company-info/history', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/company-info/history',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(true);
  });

  it('marks companyInfo active on /admin/company-info/history/v-1', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/company-info/history/v-1',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(true);
  });

  it('marks companyInfo NOT active on a hypothetical future /admin/users path', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/users',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(false);
  });

  it('marks companyInfo NOT active on /', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.isActive).toBe(false);
  });

  it('uses Romanian label when passed roCommon', () => {
    const model = mapToAdminTabBarUIModel({
      translations: roCommon,
      pathname: '/admin/company-info',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.items[0]?.label).toBe(roCommon.admin.tabs.companyInfo);
  });

  it('uses translations.appName as the navAriaLabel', () => {
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/company-info',
      registry: ADMIN_TAB_REGISTRY,
    });
    expect(model.navAriaLabel).toBe(enCommon.appName);
  });

  it('supports a custom registry with multiple entries, resolving each isActive independently', () => {
    const customRegistry: readonly AdminTab[] = [
      {
        id: 'companyInfo',
        labelKey: 'companyInfo',
        href: '/admin/company-info',
        isActive: (pathname) => pathname.startsWith('/admin/company-info'),
      },
      {
        id: 'companyInfo',
        labelKey: 'companyInfo',
        href: '/admin/users',
        isActive: (pathname) => pathname.startsWith('/admin/users'),
      },
    ];
    const model = mapToAdminTabBarUIModel({
      translations: enCommon,
      pathname: '/admin/users',
      registry: customRegistry,
    });
    expect(model.items).toHaveLength(2);
    expect(model.items[0]?.isActive).toBe(false);
    expect(model.items[1]?.isActive).toBe(true);
  });
});
