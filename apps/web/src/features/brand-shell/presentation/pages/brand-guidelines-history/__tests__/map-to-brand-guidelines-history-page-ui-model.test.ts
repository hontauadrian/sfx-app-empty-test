import { describe, expect, it } from 'vitest';
import type { BrandGuidelinesVersion } from '@sfx/domain';
import type { AdminBrandGuidelinesHistoryTranslations } from '@/features/presentation/localization/types';
import { mapToBrandGuidelinesHistoryPageUIModel } from '../map-to-brand-guidelines-history-page-ui-model';

const labels: AdminBrandGuidelinesHistoryTranslations = {
  pageTitle: 'Version history',
  viewHistoryCta: 'View history',
  backToCurrent: 'Back to current',
  columnHeaders: { savedAt: 'Saved at', editor: 'Editor', changeNote: 'Change note' },
  emptyState: { title: 'No versions yet', message: 'Save the form to create the first version.' },
  loadingLabel: 'Loading…',
  errorTitle: 'Error',
  errorMessage: 'Try again',
  deniedTitle: 'Denied',
  deniedMessage: 'No access',
  notFoundTitle: 'Not found',
  notFoundMessage: 'No brand',
  rowAriaLabelTemplate: 'Version saved by {editor} at {timestamp}',
  changeNoteLabel: 'Change note',
  changeNotePlaceholder: 'Describe',
  changeNotePlaceholderEmpty: '—',
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

describe('mapToBrandGuidelinesHistoryPageUIModel', () => {
  it('returns ready status with one row when given one version', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      versions: [makeVersion()],
      translations: labels,
    });
    expect(uiModel.status).toBe('ready');
    expect(uiModel.rows).toHaveLength(1);
    expect(uiModel.rows[0]?.href).toBe('/admin/brand-guidelines/b-1/history/v-1');
    expect(uiModel.rows[0]?.editorLabel).toBe('admin@example.com');
    expect(uiModel.rows[0]?.ariaLabel).toContain('admin@example.com');
  });

  it('emits null changeNoteLabel for trimmed-empty notes', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      versions: [makeVersion({ changeNote: '   ' })],
      translations: labels,
    });
    expect(uiModel.rows[0]?.changeNoteLabel).toBeNull();
  });

  it('preserves a populated change note', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      versions: [makeVersion({ changeNote: 'tone tighten' })],
      translations: labels,
    });
    expect(uiModel.rows[0]?.changeNoteLabel).toBe('tone tighten');
  });

  it('falls back to editorUserId when display name is empty', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'ready',
      versions: [makeVersion({ editorDisplayName: '', editorUserId: 'u-1' })],
      translations: labels,
    });
    expect(uiModel.rows[0]?.editorLabel).toBe('u-1');
  });

  it('returns empty status with no rows when versions array empty', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'empty',
      versions: [],
      translations: labels,
    });
    expect(uiModel.status).toBe('empty');
    expect(uiModel.rows).toEqual([]);
  });

  it('emits backToCurrent href scoped to the brand', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-42',
      status: 'empty',
      versions: [],
      translations: labels,
    });
    expect(uiModel.backToCurrent.href).toBe('/admin/brand-guidelines/b-42');
  });

  it('exposes denied / notFound / error feedback strings from labels', () => {
    const uiModel = mapToBrandGuidelinesHistoryPageUIModel({
      brandId: 'b-1',
      status: 'denied',
      versions: [],
      translations: labels,
    });
    expect(uiModel.denied.title).toBe('Denied');
    expect(uiModel.notFound.title).toBe('Not found');
    expect(uiModel.error.title).toBe('Error');
  });
});
