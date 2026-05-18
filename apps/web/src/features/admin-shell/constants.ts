export const HOME_ROUTE = '/';
export const ADMIN_ROUTE = '/admin';
export const ADMIN_COMPANY_INFO_ROUTE = '/admin/company-info';
export const ADMIN_BRAND_GUIDELINES_ROUTE = '/admin/brand-guidelines';

export type AdminTabId = 'companyInfo' | 'brandGuidelines';
export type AdminTabLabelKey = 'companyInfo' | 'brandGuidelines';

export interface AdminTab {
  readonly id: AdminTabId;
  readonly labelKey: AdminTabLabelKey;
  readonly href: string;
  readonly isActive: (pathname: string) => boolean;
}

export const ADMIN_TAB_REGISTRY: readonly AdminTab[] = [
  {
    id: 'companyInfo',
    labelKey: 'companyInfo',
    href: ADMIN_COMPANY_INFO_ROUTE,
    isActive: (pathname) =>
      pathname === ADMIN_ROUTE ||
      pathname === ADMIN_COMPANY_INFO_ROUTE ||
      pathname.startsWith(`${ADMIN_COMPANY_INFO_ROUTE}/`),
  },
  {
    id: 'brandGuidelines',
    labelKey: 'brandGuidelines',
    href: ADMIN_BRAND_GUIDELINES_ROUTE,
    isActive: (pathname) =>
      pathname === ADMIN_BRAND_GUIDELINES_ROUTE ||
      pathname.startsWith(`${ADMIN_BRAND_GUIDELINES_ROUTE}/`),
  },
];
