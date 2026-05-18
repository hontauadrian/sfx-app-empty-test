import type { BrandGuidelinesVersion } from '@sfx/domain';
import type { AdminBrandGuidelinesHistoryTranslations } from '@/features/presentation/localization/types';
import type {
  BrandGuidelinesHistoryPageUIModel,
  BrandGuidelinesHistoryRowUIModel,
  BrandGuidelinesHistoryStatus,
} from './types';

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface MapToBrandGuidelinesHistoryPageUIModelInput {
  readonly brandId: string;
  readonly status: BrandGuidelinesHistoryStatus;
  readonly versions: readonly BrandGuidelinesVersion[];
  readonly translations: AdminBrandGuidelinesHistoryTranslations;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function formatRow(
  version: BrandGuidelinesVersion,
  brandId: string,
  translations: AdminBrandGuidelinesHistoryTranslations,
): BrandGuidelinesHistoryRowUIModel {
  const savedAtLabel = TIMESTAMP_FORMATTER.format(version.createdAt);
  const editorLabel = version.editorDisplayName || version.editorUserId;
  const trimmedNote = version.changeNote?.trim() ?? '';
  const changeNoteLabel = trimmedNote.length > 0 ? trimmedNote : null;
  const ariaLabel = applyTemplate(translations.rowAriaLabelTemplate, {
    editor: editorLabel,
    timestamp: savedAtLabel,
  });
  return {
    id: version.id,
    href: `/admin/brand-guidelines/${brandId}/history/${version.id}`,
    savedAtLabel,
    editorLabel,
    changeNoteLabel,
    ariaLabel,
  };
}

export function mapToBrandGuidelinesHistoryPageUIModel(
  input: MapToBrandGuidelinesHistoryPageUIModelInput,
): BrandGuidelinesHistoryPageUIModel {
  const { brandId, status, versions, translations } = input;
  return {
    status,
    title: translations.pageTitle,
    columnHeaders: translations.columnHeaders,
    rows: versions.map((version) => formatRow(version, brandId, translations)),
    empty: translations.emptyState,
    error: { title: translations.errorTitle, message: translations.errorMessage },
    denied: { title: translations.deniedTitle, message: translations.deniedMessage },
    notFound: { title: translations.notFoundTitle, message: translations.notFoundMessage },
    backToCurrent: {
      label: translations.backToCurrent,
      href: `/admin/brand-guidelines/${brandId}`,
    },
    loadingLabel: translations.loadingLabel,
    emptyChangeNote: translations.changeNotePlaceholderEmpty,
  };
}
