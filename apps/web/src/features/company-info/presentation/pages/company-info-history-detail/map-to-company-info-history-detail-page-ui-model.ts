import type { CompanyInfo, CompanyInfoVersion } from '@sfx/domain';
import type { CommonTranslations } from '@/features/presentation/localization';
import type {
  CompanyInfoFieldName,
  CompanyInfoFieldUIModel,
  CompanyInfoSectionUIModel,
} from '../company-info/types';
import type {
  CompanyInfoHistoryDetailFieldUIModel,
  CompanyInfoHistoryDetailFieldValue,
  CompanyInfoHistoryDetailPageUIModel,
  CompanyInfoHistoryDetailSectionUIModel,
  CompanyInfoHistoryDetailStatus,
} from './types';

export interface MapToCompanyInfoHistoryDetailPageUIModelInput {
  readonly translations: CommonTranslations;
  readonly version: CompanyInfoVersion | null | undefined;
  readonly isLoading: boolean;
  readonly isDenied: boolean;
  readonly isNotFound: boolean;
  readonly isErrored: boolean;
  readonly locale: string;
}

interface SectionSpec {
  readonly key: CompanyInfoSectionUIModel['key'];
  readonly titleSelector: (translations: CommonTranslations) => string;
  readonly fields: ReadonlyArray<{
    readonly name: CompanyInfoFieldName;
    readonly type: CompanyInfoFieldUIModel['type'];
  }>;
}

const SECTION_SPECS: ReadonlyArray<SectionSpec> = [
  {
    key: 'legalRegistration',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.legalRegistration,
    fields: [
      { name: 'legalName', type: 'text' },
      { name: 'tradingName', type: 'text' },
      { name: 'taxId', type: 'text' },
      { name: 'registrationNumber', type: 'text' },
    ],
  },
  {
    key: 'identity',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.identity,
    fields: [
      { name: 'companyName', type: 'text' },
      { name: 'industry', type: 'text' },
      { name: 'foundedYear', type: 'number' },
      { name: 'teamSize', type: 'number' },
    ],
  },
  {
    key: 'keyFacts',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.keyFacts,
    fields: [
      { name: 'missionStatement', type: 'textarea' },
      { name: 'visionStatement', type: 'textarea' },
      { name: 'coreValues', type: 'array' },
      { name: 'certifications', type: 'array' },
    ],
  },
  {
    key: 'contact',
    titleSelector: (translations) => translations.adminCompanyInfo.sections.contact,
    fields: [
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'tel' },
      { name: 'website', type: 'url' },
      { name: 'addressLine1', type: 'text' },
      { name: 'addressLine2', type: 'text' },
      { name: 'city', type: 'text' },
      { name: 'postalCode', type: 'text' },
      { name: 'country', type: 'text' },
    ],
  },
];

function deriveStatus(input: MapToCompanyInfoHistoryDetailPageUIModelInput): CompanyInfoHistoryDetailStatus {
  if (input.isLoading) return 'loading';
  if (input.isDenied) return 'denied';
  if (input.isNotFound) return 'not-found';
  if (input.isErrored) return 'error';
  if (input.version) return 'ready';
  return 'loading';
}

function formatTimestamp(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function substitute(template: string, editor: string, timestamp: string): string {
  return template.replace('{editor}', editor).replace('{timestamp}', timestamp);
}

function arrayFieldValue(
  source: readonly string[] | null | undefined,
  emptyText: string,
): CompanyInfoHistoryDetailFieldValue {
  const items = (source ?? []).filter((entry) => typeof entry === 'string');
  return { kind: 'array', items, emptyText };
}

function scalarFieldValue(
  source: string | number | null | undefined,
  type: CompanyInfoFieldUIModel['type'],
  emptyText: string,
): CompanyInfoHistoryDetailFieldValue {
  const kind: 'scalar' | 'multiline' = type === 'textarea' ? 'multiline' : 'scalar';
  if (source === null || source === undefined) {
    return { kind, text: emptyText };
  }
  if (typeof source === 'number') {
    if (!Number.isFinite(source)) return { kind, text: emptyText };
    return { kind, text: String(source) };
  }
  if (typeof source === 'string' && source.length === 0) {
    return { kind, text: emptyText };
  }
  return { kind, text: source };
}

function buildField(
  snapshot: CompanyInfo,
  field: SectionSpec['fields'][number],
  translations: CommonTranslations,
): CompanyInfoHistoryDetailFieldUIModel {
  const empty = translations.adminCompanyInfo.historyDetail.emptyValuePlaceholder;
  const raw = snapshot[field.name];
  let value: CompanyInfoHistoryDetailFieldValue;
  if (field.type === 'array') {
    value = arrayFieldValue(raw as readonly string[] | null | undefined, empty);
  } else {
    value = scalarFieldValue(raw as string | number | null | undefined, field.type, empty);
  }
  return {
    name: field.name,
    label: translations.adminCompanyInfo.fields[field.name].label,
    type: field.type,
    value,
  };
}

function buildSections(
  snapshot: CompanyInfo,
  translations: CommonTranslations,
): readonly CompanyInfoHistoryDetailSectionUIModel[] {
  return SECTION_SPECS.map<CompanyInfoHistoryDetailSectionUIModel>((spec) => ({
    key: spec.key,
    title: spec.titleSelector(translations),
    fields: spec.fields.map((field) => buildField(snapshot, field, translations)),
  }));
}

function emptySections(translations: CommonTranslations): readonly CompanyInfoHistoryDetailSectionUIModel[] {
  return SECTION_SPECS.map<CompanyInfoHistoryDetailSectionUIModel>((spec) => ({
    key: spec.key,
    title: spec.titleSelector(translations),
    fields: [],
  }));
}

export function mapToCompanyInfoHistoryDetailPageUIModel(
  input: MapToCompanyInfoHistoryDetailPageUIModelInput,
): CompanyInfoHistoryDetailPageUIModel {
  const status = deriveStatus(input);
  const detail = input.translations.adminCompanyInfo.historyDetail;
  const sections =
    status === 'ready' && input.version
      ? buildSections(input.version.snapshot, input.translations)
      : emptySections(input.translations);
  const bannerMessage = input.version
    ? substitute(
        detail.bannerTemplate,
        input.version.editorDisplayName,
        formatTimestamp(input.version.createdAt, input.locale),
      )
    : detail.bannerTemplate;

  return {
    status,
    title: detail.pageTitle,
    readOnlyAriaSuffix: detail.readOnlyAriaSuffix,
    banner: { message: bannerMessage },
    sections,
    backToCurrent: {
      label: detail.backToCurrent,
      href: '/admin/company-info',
    },
    denied: {
      title: input.translations.admin.denied.title,
      message: input.translations.admin.denied.message,
      backToHomeLabel: input.translations.admin.denied.backToHome,
      backToHomeHref: '/',
    },
    notFound: {
      title: detail.notFoundTitle,
      message: detail.notFoundMessage,
    },
    error: {
      title: detail.errorTitle,
      message: detail.errorMessage,
    },
  };
}
