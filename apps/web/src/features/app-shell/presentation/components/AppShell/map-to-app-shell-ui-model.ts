import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandProfile } from '@/features/brand-profile/data/mapper/map-to-brand-profile';
import { brandRoute, DASHBOARD_ROUTE } from '@/features/brand-profile/constants';
import type { AppShellUIModel } from './types';
import type { LeftNavItem } from '../LeftNav/types';

const BRAND_ROUTE_PATTERN = /^\/brands\/([^/]+)(?:\/.*)?$/;

export function getBrandIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === '/brands/new') return null;
  const match = BRAND_ROUTE_PATTERN.exec(pathname);
  return match?.[1] ?? null;
}

interface MapToAppShellUIModelInput {
  readonly translations: CommonTranslations;
  readonly brands: readonly BrandProfile[];
  readonly activeBrandId: string | null;
  readonly pathname: string | null;
  readonly email: string | null;
  readonly signOutHref: string;
}

export function mapToAppShellUIModel(input: MapToAppShellUIModelInput): AppShellUIModel {
  const { translations, brands, activeBrandId, pathname, email, signOutHref } = input;

  const currentBrand =
    activeBrandId !== null ? brands.find((entry) => entry.id === activeBrandId) ?? null : null;

  const pathBrandId = getBrandIdFromPath(pathname);
  const leftNavItems: LeftNavItem[] | null =
    pathBrandId !== null
      ? [
          {
            key: 'overview',
            label: translations.overview,
            href: brandRoute(pathBrandId),
          },
          {
            key: 'brand-voice',
            label: translations.brandVoice,
            href: `${brandRoute(pathBrandId)}#brand-voice`,
          },
          {
            key: 'visual-identity',
            label: translations.visualIdentity,
            href: `${brandRoute(pathBrandId)}#visual-identity`,
          },
        ]
      : null;

  return {
    brandMarkLabel: translations.brandGuidelinesAppName,
    brandMarkHref: DASHBOARD_ROUTE,
    selectBrandLabel: translations.selectBrand,
    currentBrandName: currentBrand?.name ?? null,
    brandOptions: brands.map((entry) => ({ id: entry.id, name: entry.name })),
    createBrandLabel: translations.noBrandsCta,
    signOutLabel: translations.signOut,
    signOutHref,
    email,
    leftNavItems,
    leftNavLabel: translations.brands,
  };
}
