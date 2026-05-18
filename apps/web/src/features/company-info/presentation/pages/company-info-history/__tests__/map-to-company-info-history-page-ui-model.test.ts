import { describe, expect, it } from 'vitest';
import type { CompanyInfoVersion } from '@sfx/domain';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToCompanyInfoHistoryPageUIModel } from '../map-to-company-info-history-page-ui-model';

function snapshot(): CompanyInfoVersion['snapshot'] {
  return {
    id: 'cid-1',
    legalName: 'Acme',
    tradingName: null,
    email: null,
    phone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    taxId: null,
    registrationNumber: null,
    companyName: null,
    foundedYear: null,
    teamSize: null,
    industry: null,
    missionStatement: null,
    visionStatement: null,
    coreValues: [],
    certifications: [],
    createdAt: new Date('2024-06-01T10:00:00.000Z'),
    updatedAt: new Date('2024-06-01T10:00:00.000Z'),
  };
}

function version(overrides: Partial<CompanyInfoVersion> = {}): CompanyInfoVersion {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: snapshot(),
    editorUserId: 'user-1',
    editorDisplayName: 'Ada Lovelace',
    createdAt: new Date('2024-06-02T10:00:00.000Z'),
    ...overrides,
  };
}

describe('mapToCompanyInfoHistoryPageUIModel', () => {
  it('returns status "loading" when isLoading is true', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: null,
      isLoading: true,
      isDenied: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('loading');
  });

  it('returns status "empty" when no items are returned', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: [],
      isLoading: false,
      isDenied: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('empty');
    expect(ui.empty.title).toBe(enCommon.adminCompanyInfo.history.emptyState.title);
    expect(ui.empty.message).toBe(enCommon.adminCompanyInfo.history.emptyState.message);
  });

  it('returns status "ready" with mapped rows when items are populated', () => {
    const items = [version({ id: 'v-1' }), version({ id: 'v-2', editorDisplayName: 'Grace Hopper' })];
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items,
      isLoading: false,
      isDenied: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('ready');
    expect(ui.rows).toHaveLength(2);
    expect(ui.rows[0]?.id).toBe('v-1');
    expect(ui.rows[0]?.href).toBe('/admin/company-info/history/v-1');
    expect(ui.rows[0]?.editorLabel).toBe('Ada Lovelace');
    expect(ui.rows[0]?.savedAtLabel.length).toBeGreaterThan(0);
    expect(ui.rows[0]?.ariaLabel).toContain('Ada Lovelace');
    expect(ui.rows[0]?.ariaLabel).toContain(ui.rows[0]?.savedAtLabel ?? '');
    expect(ui.rows[1]?.editorLabel).toBe('Grace Hopper');
  });

  it('returns status "denied" when isDenied', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: null,
      isLoading: false,
      isDenied: true,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('denied');
    expect(ui.denied.title).toBe(enCommon.admin.denied.title);
    expect(ui.denied.backToHomeHref).toBe('/');
  });

  it('returns status "error" when isErrored', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: null,
      isLoading: false,
      isDenied: false,
      isErrored: true,
      locale: 'en-US',
    });
    expect(ui.status).toBe('error');
    expect(ui.error.title).toBe(enCommon.adminCompanyInfo.history.errorTitle);
    expect(ui.error.message).toBe(enCommon.adminCompanyInfo.history.errorMessage);
  });

  it('uses the page title + back-to-current link from translations', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: [],
      isLoading: false,
      isDenied: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.title).toBe(enCommon.adminCompanyInfo.history.pageTitle);
    expect(ui.backToCurrent.href).toBe('/admin/company-info');
    expect(ui.backToCurrent.label).toBe(enCommon.adminCompanyInfo.history.backToCurrent);
  });

  it('formats timestamps deterministically under en-US locale', () => {
    const ui = mapToCompanyInfoHistoryPageUIModel({
      translations: enCommon,
      items: [version({ createdAt: new Date('2024-06-02T10:00:00.000Z') })],
      isLoading: false,
      isDenied: false,
      isErrored: false,
      locale: 'en-US',
    });
    const expected = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2024-06-02T10:00:00.000Z'));
    expect(ui.rows[0]?.savedAtLabel).toBe(expected);
  });
});
