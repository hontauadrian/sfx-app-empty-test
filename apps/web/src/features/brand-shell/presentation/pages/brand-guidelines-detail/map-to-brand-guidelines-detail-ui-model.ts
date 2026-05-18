import type { Brand } from '@sfx/domain';
import { ADMIN_BRAND_GUIDELINES_ROUTE } from '@/features/admin-shell/constants';
import type { CommonTranslations } from '@/features/presentation/localization/types';
import type {
  BrandGuidelinesDetailStatus,
  BrandGuidelinesDetailUIModel,
} from './types';

interface MapInput {
  readonly labels: CommonTranslations['adminBrandGuidelines'];
  readonly status: BrandGuidelinesDetailStatus;
  readonly activeBrand: Brand | null;
}

export function mapToBrandGuidelinesDetailUIModel(
  input: MapInput,
): BrandGuidelinesDetailUIModel {
  return {
    status: input.status,
    pageTitle: input.labels.pageTitle,
    notFound: {
      title: input.labels.notFound.title,
      message: input.labels.notFound.message,
      backLabel: input.labels.notFound.backCta,
      backHref: ADMIN_BRAND_GUIDELINES_ROUTE,
    },
    placeholder: {
      title: input.labels.placeholderBody.title,
      message: input.labels.placeholderBody.message,
    },
    activeBrandName: input.activeBrand?.name ?? '',
    auditLogCtaLabel: input.labels.auditLog?.viewAuditLogCta ?? 'View audit log',
  };
}
