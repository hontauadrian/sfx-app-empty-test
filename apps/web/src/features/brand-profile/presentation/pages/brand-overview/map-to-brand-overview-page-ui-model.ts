import type { CommonTranslations } from '@/features/presentation/localization';
import type { BrandProfile } from '../../../data/mapper/map-to-brand-profile';
import { brandRoute } from '../../../constants';
import type { BrandOverviewPageUIModel } from './types';

interface MapToBrandOverviewInput {
  readonly translations: CommonTranslations;
  readonly brand: BrandProfile | undefined;
  readonly brandId: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly notFound: boolean;
}

export function mapToBrandOverviewPageUIModel(
  input: MapToBrandOverviewInput,
): BrandOverviewPageUIModel {
  const { translations, brand, brandId, isLoading, isError, notFound } = input;
  return {
    brandName: brand?.name ?? '',
    isLoading,
    hasError: isError && !notFound,
    notFound,
    errorLabel: translations.error,
    settingsLabel: translations.brandSettings,
    renameLabel: translations.rename,
    deleteLabel: translations.deleteBrand,
    brandVoiceTitle: translations.brandVoiceSectionTitle,
    brandVoiceCtaLabel: translations.editBrandVoice,
    brandVoiceCtaHref: `${brandRoute(brandId)}/voice/edit`,
    visualIdentityTitle: translations.visualIdentitySectionTitle,
    visualIdentityCtaLabel: translations.editVisualIdentity,
    visualIdentityCtaHref: `${brandRoute(brandId)}/visual-identity/edit`,
    renameModalTitle: translations.renameBrandTitle,
    renameSubmitLabel: translations.save,
    renameCancelLabel: translations.cancel,
    renameNameLabel: translations.brandNameLabel,
    renameNameRequiredError: translations.validationBrandNameRequired,
    renameNameTooLongError: translations.validationBrandNameTooLong,
    deleteModalTitle: translations.deleteBrandConfirmTitle,
    deleteModalBody: translations.deleteBrandConfirmBody,
    deleteConfirmLabel: translations.delete,
    deleteCancelLabel: translations.cancel,
  };
}
