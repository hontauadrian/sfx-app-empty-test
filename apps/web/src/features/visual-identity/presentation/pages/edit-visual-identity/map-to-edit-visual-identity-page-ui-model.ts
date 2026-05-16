import type { CommonTranslations } from '@/features/presentation/localization';
import type { VisualIdentity } from '../../../data/mapper/map-to-visual-identity';
import type { VisualIdentityFormValues } from '../../validators/visual-identity-form';
import type { EditVisualIdentityPageUIModel } from './types';

export interface MapToEditVisualIdentityInput {
  readonly translations: CommonTranslations;
  readonly identity: VisualIdentity | null | undefined;
  readonly isLoading: boolean;
  readonly notFound: boolean;
  readonly hasError: boolean;
  readonly serverError: string | null;
}

export function buildDefaultValues(
  identity: VisualIdentity | null | undefined,
): VisualIdentityFormValues {
  if (!identity) {
    return {
      logoUsageRules: null,
      colourPalette: [],
      typographyRules: [],
      spacingLayoutGuidance: null,
      imageStyleGuidance: null,
      iconographyGuidance: null,
      usageRestrictions: null,
    } as VisualIdentityFormValues;
  }
  return {
    logoUsageRules: identity.logoUsageRules,
    colourPalette: identity.colourPalette.map((entry) => ({
      name: entry.name,
      hex: entry.hex,
      usage: entry.usage,
    })),
    typographyRules: identity.typographyRules.map((entry) => ({
      role: entry.role,
      family: entry.family,
      weight: entry.weight,
      size: entry.size,
      notes: entry.notes,
    })),
    spacingLayoutGuidance: identity.spacingLayoutGuidance,
    imageStyleGuidance: identity.imageStyleGuidance,
    iconographyGuidance: identity.iconographyGuidance,
    usageRestrictions: identity.usageRestrictions,
  } as VisualIdentityFormValues;
}

export function mapToEditVisualIdentityPageUIModel(
  input: MapToEditVisualIdentityInput,
): EditVisualIdentityPageUIModel {
  const { translations, identity, isLoading, notFound, hasError, serverError } = input;
  return {
    title: translations.visualIdentityEditPageTitle,
    saveLabel: translations.save,
    cancelLabel: translations.cancel,
    isLoading,
    notFound,
    hasError,
    errorLabel: translations.error,
    serverErrorLabel: serverError,
    translations,
    defaultValues: buildDefaultValues(identity),
  };
}
