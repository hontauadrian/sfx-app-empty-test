import type { VisualIdentity } from '@sfx/domain';
import type { VisualIdentityDataModel } from '../model/visual-identity-data-model';

export function mapToVisualIdentity(data: VisualIdentityDataModel): VisualIdentity {
  return {
    brandId: data.brandId,
    logoUsage: data.logoUsage,
    colorPalette: data.colorPalette,
    typography: data.typography,
    spacingGuidance: data.spacingGuidance,
    imageStyleGuidance: data.imageStyleGuidance,
    iconographyGuidance: data.iconographyGuidance,
    usageRestrictions: data.usageRestrictions,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

export function mapToVisualIdentityOrNull(
  data: VisualIdentityDataModel | null | undefined,
): VisualIdentity | null {
  if (data === null || data === undefined) return null;
  return mapToVisualIdentity(data);
}
