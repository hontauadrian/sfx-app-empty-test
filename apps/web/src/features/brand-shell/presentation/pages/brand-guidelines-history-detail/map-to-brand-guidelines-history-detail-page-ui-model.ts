import type { BrandGuidelinesVersion } from '@sfx/domain';
import type { AdminBrandGuidelinesHistoryDetailTranslations } from '@/features/presentation/localization/types';
import type {
  BrandGuidelinesHistoryDetailPageUIModel,
  BrandGuidelinesHistoryDetailSectionUIModel,
  BrandGuidelinesHistoryDetailStatus,
} from './types';

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export interface MapToBrandGuidelinesHistoryDetailPageUIModelInput {
  readonly brandId: string;
  readonly status: BrandGuidelinesHistoryDetailStatus;
  readonly version: BrandGuidelinesVersion | undefined;
  readonly translations: AdminBrandGuidelinesHistoryDetailTranslations;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export function mapToBrandGuidelinesHistoryDetailPageUIModel(
  input: MapToBrandGuidelinesHistoryDetailPageUIModelInput,
): BrandGuidelinesHistoryDetailPageUIModel {
  const { brandId, status, version, translations } = input;
  const emptyPlaceholder = translations.emptyValuePlaceholder;
  const readOnlySuffix = translations.readOnlyAriaSuffix;

  const editor = version ? version.editorDisplayName || version.editorUserId : '';
  const timestamp = version ? TIMESTAMP_FORMATTER.format(version.createdAt) : '';
  const changeNote = (version?.changeNote ?? '').trim();
  const bannerMessage = version
    ? applyTemplate(translations.bannerTemplate, {
        editor,
        timestamp,
        changeNote: changeNote.length > 0 ? changeNote : translations.bannerChangeNoteEmpty,
      })
    : '';

  const sections: readonly BrandGuidelinesHistoryDetailSectionUIModel[] = version
    ? [
        {
          key: 'voice',
          title: translations.sectionTitles.voice,
          data: version.snapshot.voice,
        },
        {
          key: 'visual',
          title: translations.sectionTitles.visual,
          data: version.snapshot.visual,
        },
        {
          key: 'dosAndDonts',
          title: translations.sectionTitles.dosAndDonts,
          data: version.snapshot.dosAndDonts,
        },
        {
          key: 'metadata',
          title: translations.sectionTitles.metadata,
          data: version.snapshot.metadata,
        },
      ]
    : [];

  return {
    status,
    title: translations.pageTitle,
    banner: { message: bannerMessage },
    sections,
    backToCurrent: {
      label: translations.backToCurrent,
      href: `/admin/brand-guidelines/${brandId}`,
    },
    denied: { title: translations.deniedTitle, message: translations.deniedMessage },
    notFound: { title: translations.notFoundTitle, message: translations.notFoundMessage },
    error: { title: translations.errorTitle, message: translations.errorMessage },
    readOnlyAriaSuffix: readOnlySuffix,
    emptyValuePlaceholder: emptyPlaceholder,
  };
}
