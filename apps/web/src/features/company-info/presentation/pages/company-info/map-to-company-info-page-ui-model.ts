import type { CompanyInfo } from '@sfx/domain';
import type { CommonTranslations } from '@/features/presentation/localization';
import type {
  CompanyInfoFieldName,
  CompanyInfoFieldUIModel,
  CompanyInfoPageStatus,
  CompanyInfoPageUIModel,
  CompanyInfoSectionUIModel,
} from './types';

export interface MapToCompanyInfoPageUIModelInput {
  readonly translations: CommonTranslations;
  readonly record: CompanyInfo | null | undefined;
  readonly isLoading: boolean;
  readonly isDenied: boolean;
  readonly isPending: boolean;
}

interface SectionSpec {
  readonly key: CompanyInfoSectionUIModel['key'];
  readonly titleSelector: (translations: CommonTranslations) => string;
  readonly fields: ReadonlyArray<{
    readonly name: CompanyInfoFieldName;
    readonly type: CompanyInfoFieldUIModel['type'];
    readonly required: boolean;
  }>;
}

const SECTION_SPECS: ReadonlyArray<SectionSpec> = [
  {
    key: 'legalRegistration',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.legalRegistration,
    fields: [
      { name: 'legalName', type: 'text', required: true },
      { name: 'tradingName', type: 'text', required: false },
      { name: 'taxId', type: 'text', required: false },
      { name: 'registrationNumber', type: 'text', required: false },
    ],
  },
  {
    key: 'identity',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.identity,
    fields: [
      { name: 'companyName', type: 'text', required: false },
      { name: 'industry', type: 'text', required: false },
      { name: 'foundedYear', type: 'number', required: false },
      { name: 'teamSize', type: 'number', required: false },
    ],
  },
  {
    key: 'keyFacts',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.keyFacts,
    fields: [
      { name: 'missionStatement', type: 'textarea', required: false },
      { name: 'visionStatement', type: 'textarea', required: false },
      { name: 'coreValues', type: 'array', required: false },
      { name: 'certifications', type: 'array', required: false },
    ],
  },
  {
    key: 'contact',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.contact,
    fields: [
      { name: 'email', type: 'email', required: false },
      { name: 'phone', type: 'tel', required: false },
      { name: 'website', type: 'url', required: false },
      { name: 'addressLine1', type: 'text', required: false },
      { name: 'addressLine2', type: 'text', required: false },
      { name: 'city', type: 'text', required: false },
      { name: 'postalCode', type: 'text', required: false },
      { name: 'country', type: 'text', required: false },
    ],
  },
];

function deriveStatus(isLoading: boolean, isDenied: boolean): CompanyInfoPageStatus {
  if (isLoading) return 'loading';
  if (isDenied) return 'denied';
  return 'ready';
}

function deriveSubmitLabel(
  translations: CommonTranslations,
  hasRecord: boolean,
  isPending: boolean,
): string {
  if (isPending) return translations.adminCompanyInfo.cta.saving;
  if (hasRecord) return translations.adminCompanyInfo.cta.save;
  return translations.adminCompanyInfo.cta.create;
}

function buildSections(translations: CommonTranslations): readonly CompanyInfoSectionUIModel[] {
  return SECTION_SPECS.map<CompanyInfoSectionUIModel>((spec) => ({
    key: spec.key,
    title: spec.titleSelector(translations),
    fields: spec.fields.map<CompanyInfoFieldUIModel>((field) => ({
      name: field.name,
      label: translations.adminCompanyInfo.fields[field.name].label,
      placeholder: translations.adminCompanyInfo.fields[field.name].placeholder,
      type: field.type,
      required: field.required,
    })),
  }));
}

export function mapToCompanyInfoPageUIModel(
  input: MapToCompanyInfoPageUIModelInput,
): CompanyInfoPageUIModel {
  const status = deriveStatus(input.isLoading, input.isDenied);
  const hasRecord = input.record !== null && input.record !== undefined;

  return {
    status,
    title: input.translations.adminCompanyInfo.pageTitle,
    sections: buildSections(input.translations),
    submit: {
      label: deriveSubmitLabel(input.translations, hasRecord, input.isPending),
      disabled: input.isPending,
      pending: input.isPending,
    },
    denied: {
      title: input.translations.admin.denied.title,
      message: input.translations.admin.denied.message,
      backToHomeLabel: input.translations.admin.denied.backToHome,
      backToHomeHref: '/',
    },
    viewHistory: {
      label: input.translations.adminCompanyInfo.history.viewHistoryCta,
      href: '/admin/company-info/history',
    },
  };
}
