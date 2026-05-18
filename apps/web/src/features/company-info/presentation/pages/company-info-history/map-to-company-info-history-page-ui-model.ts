import type { CompanyInfoVersion } from '@sfx/domain';
import type { CommonTranslations } from '@/features/presentation/localization';
import type {
  CompanyInfoHistoryPageStatus,
  CompanyInfoHistoryPageUIModel,
  CompanyInfoHistoryRowUIModel,
} from './types';

export interface MapToCompanyInfoHistoryPageUIModelInput {
  readonly translations: CommonTranslations;
  readonly items: readonly CompanyInfoVersion[] | null | undefined;
  readonly isLoading: boolean;
  readonly isDenied: boolean;
  readonly isErrored: boolean;
  readonly locale: string;
}

function deriveStatus(
  isLoading: boolean,
  isDenied: boolean,
  isErrored: boolean,
  itemCount: number,
): CompanyInfoHistoryPageStatus {
  if (isLoading) return 'loading';
  if (isDenied) return 'denied';
  if (isErrored) return 'error';
  if (itemCount === 0) return 'empty';
  return 'ready';
}

function formatTimestamp(value: Date, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return formatter.format(value);
}

function substituteRowAria(template: string, editor: string, timestamp: string): string {
  return template.replace('{editor}', editor).replace('{timestamp}', timestamp);
}

function buildRows(
  items: readonly CompanyInfoVersion[],
  rowAriaTemplate: string,
  locale: string,
): readonly CompanyInfoHistoryRowUIModel[] {
  return items.map<CompanyInfoHistoryRowUIModel>((version) => {
    const savedAtLabel = formatTimestamp(version.createdAt, locale);
    const editorLabel = version.editorDisplayName;
    return {
      id: version.id,
      href: `/admin/company-info/history/${version.id}`,
      savedAtLabel,
      editorLabel,
      ariaLabel: substituteRowAria(rowAriaTemplate, editorLabel, savedAtLabel),
    };
  });
}

export function mapToCompanyInfoHistoryPageUIModel(
  input: MapToCompanyInfoHistoryPageUIModelInput,
): CompanyInfoHistoryPageUIModel {
  const items = input.items ?? [];
  const status = deriveStatus(input.isLoading, input.isDenied, input.isErrored, items.length);
  const history = input.translations.adminCompanyInfo.history;
  const rows = buildRows(items, history.rowAriaLabelTemplate, input.locale);

  return {
    status,
    title: history.pageTitle,
    loadingLabel: history.loadingLabel,
    columnHeaders: {
      savedAt: history.columnHeaders.savedAt,
      editor: history.columnHeaders.editor,
    },
    rows,
    empty: {
      title: history.emptyState.title,
      message: history.emptyState.message,
    },
    error: {
      title: history.errorTitle,
      message: history.errorMessage,
    },
    denied: {
      title: input.translations.admin.denied.title,
      message: input.translations.admin.denied.message,
      backToHomeLabel: input.translations.admin.denied.backToHome,
      backToHomeHref: '/',
    },
    backToCurrent: {
      label: history.backToCurrent,
      href: '/admin/company-info',
    },
  };
}
