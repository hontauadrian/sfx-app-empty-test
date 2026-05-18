import { describe, expect, it } from 'vitest';
import type { BrandGuidelinesVersion } from '@sfx/domain';
import type { AdminBrandGuidelinesHistoryDetailTranslations } from '@/features/presentation/localization/types';
import { mapToBrandGuidelinesHistoryDetailPageUIModel } from '../map-to-brand-guidelines-history-detail-page-ui-model';

const labels: AdminBrandGuidelinesHistoryDetailTranslations = {
  pageTitle: 'Version snapshot',
  bannerTemplate: 'Read-only — version saved by {editor} at {timestamp}. Note: {changeNote}',
  bannerChangeNoteEmpty: '—',
  backToCurrent: 'Back',
  readOnlyAriaSuffix: ' (read-only)',
  emptyValuePlaceholder: '—',
  notFoundTitle: 'Not found',
  notFoundMessage: 'No version',
  deniedTitle: 'Denied',
  deniedMessage: 'No access',
  errorTitle: 'Error',
  errorMessage: 'Try again',
  sectionTitles: {
    voice: 'Brand Voice',
    visual: 'Visual Identity',
    dosAndDonts: "Dos & Don'ts",
    metadata: 'Metadata',
  },
};

function makeVersion(overrides: Partial<BrandGuidelinesVersion> = {}): BrandGuidelinesVersion {
  return {
    id: 'v-1',
    brandId: 'b-1',
    snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
    editorUserId: 'u-1',
    editorDisplayName: 'admin@example.com',
    changeNote: null,
    createdAt: new Date('2026-05-17T10:30:00.000Z'),
    ...overrides,
  };
}

describe('mapToBrandGuidelinesHistoryDetailPageUIModel', () => {
  it('returns the four sections in order when a version is provided', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      version: makeVersion(),
      translations: labels,
    });
    expect(uiModel.sections.map((s) => s.key)).toEqual([
      'voice',
      'visual',
      'dosAndDonts',
      'metadata',
    ]);
  });

  it('forwards snapshot data verbatim onto each section', () => {
    const version = makeVersion({
      snapshot: {
        voice: {
          tone: 'Bold',
          preferredVocabulary: ['craft'],
          restrictedVocabulary: ['cheap'],
        } as unknown as BrandGuidelinesVersion['snapshot']['voice'],
        visual: { logoUsage: 'Clear space' } as unknown as BrandGuidelinesVersion['snapshot']['visual'],
        dosAndDonts: [
          { id: 'e1', type: 'do', category: 'tone', ruleText: 'Be direct' },
        ] as unknown as BrandGuidelinesVersion['snapshot']['dosAndDonts'],
        metadata: { tags: ['en'] } as unknown as BrandGuidelinesVersion['snapshot']['metadata'],
      },
    });
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      version,
      translations: labels,
    });
    const [voice, visual, dos, meta] = uiModel.sections;
    expect(voice).toMatchObject({ key: 'voice', data: version.snapshot.voice });
    expect(visual).toMatchObject({ key: 'visual', data: version.snapshot.visual });
    expect(dos).toMatchObject({ key: 'dosAndDonts', data: version.snapshot.dosAndDonts });
    expect(meta).toMatchObject({ key: 'metadata', data: version.snapshot.metadata });
  });

  it('emits a banner with em-dash when changeNote is null', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      version: makeVersion({ changeNote: null }),
      translations: labels,
    });
    expect(uiModel.banner.message).toContain('—');
    expect(uiModel.banner.message).toContain('admin@example.com');
  });

  it('emits a banner with the trimmed changeNote when provided', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      version: makeVersion({ changeNote: '  tone tighten  ' }),
      translations: labels,
    });
    expect(uiModel.banner.message).toContain('tone tighten');
    expect(uiModel.banner.message).toContain('Note: tone tighten');
  });

  it('omits sections + banner when version is undefined', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'not-found',
      version: undefined,
      translations: labels,
    });
    expect(uiModel.sections).toEqual([]);
    expect(uiModel.banner.message).toBe('');
  });

  it('builds backToCurrent href scoped to the brand', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-7',
      status: 'ready',
      version: makeVersion(),
      translations: labels,
    });
    expect(uiModel.backToCurrent.href).toBe('/admin/brand-guidelines/b-7');
  });

  it('exposes readOnlyAriaSuffix and emptyValuePlaceholder for inline renderers', () => {
    const uiModel = mapToBrandGuidelinesHistoryDetailPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      version: makeVersion(),
      translations: labels,
    });
    expect(uiModel.readOnlyAriaSuffix).toBe(' (read-only)');
    expect(uiModel.emptyValuePlaceholder).toBe('—');
  });
});
