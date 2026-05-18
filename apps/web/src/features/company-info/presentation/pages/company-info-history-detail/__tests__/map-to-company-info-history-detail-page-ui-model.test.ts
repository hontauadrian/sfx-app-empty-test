import { describe, expect, it } from 'vitest';
import type { CompanyInfo, CompanyInfoVersion } from '@sfx/domain';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToCompanyInfoHistoryDetailPageUIModel } from '../map-to-company-info-history-detail-page-ui-model';

function snapshot(overrides: Partial<CompanyInfo> = {}): CompanyInfo {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
    email: 'contact@acme.test',
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
    ...overrides,
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

describe('mapToCompanyInfoHistoryDetailPageUIModel', () => {
  it('renders status "loading" when isLoading', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: null,
      isLoading: true,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('loading');
  });

  it('renders status "denied"', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: null,
      isLoading: false,
      isDenied: true,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('denied');
    expect(ui.denied.backToHomeHref).toBe('/');
  });

  it('renders status "not-found"', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: null,
      isLoading: false,
      isDenied: false,
      isNotFound: true,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('not-found');
    expect(ui.notFound.title).toBe(enCommon.adminCompanyInfo.historyDetail.notFoundTitle);
  });

  it('renders status "error" for generic failures', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: null,
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: true,
      locale: 'en-US',
    });
    expect(ui.status).toBe('error');
  });

  it('renders status "ready" with built sections when version is present', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: version({
        snapshot: snapshot({ foundedYear: 1998, coreValues: ['Integrity', 'Craft'] }),
      }),
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.status).toBe('ready');
    expect(ui.sections).toHaveLength(4);
    const identity = ui.sections.find((section) => section.key === 'identity');
    const foundedYear = identity?.fields.find((field) => field.name === 'foundedYear');
    expect(foundedYear?.value).toEqual({ kind: 'scalar', text: '1998' });
    const keyFacts = ui.sections.find((section) => section.key === 'keyFacts');
    const coreValues = keyFacts?.fields.find((field) => field.name === 'coreValues');
    expect(coreValues?.value).toEqual({
      kind: 'array',
      items: ['Integrity', 'Craft'],
      emptyText: enCommon.adminCompanyInfo.historyDetail.emptyValuePlaceholder,
    });
  });

  it('substitutes editor and timestamp into the banner template', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: version({
        editorDisplayName: 'Grace Hopper',
        createdAt: new Date('2024-06-02T10:00:00.000Z'),
      }),
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.banner.message).toContain('Grace Hopper');
    const expectedTime = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2024-06-02T10:00:00.000Z'));
    expect(ui.banner.message).toContain(expectedTime);
    expect(ui.banner.message).not.toContain('{editor}');
    expect(ui.banner.message).not.toContain('{timestamp}');
  });

  it('falls back to the placeholder for null scalar fields', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: version({ snapshot: snapshot({ tradingName: null }) }),
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    const tradingName = ui.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === 'tradingName');
    expect(tradingName?.value).toEqual({
      kind: 'scalar',
      text: enCommon.adminCompanyInfo.historyDetail.emptyValuePlaceholder,
    });
  });

  it('classifies textarea fields as multiline', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: version({ snapshot: snapshot({ missionStatement: 'Build great things' }) }),
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    const mission = ui.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === 'missionStatement');
    expect(mission?.value).toEqual({ kind: 'multiline', text: 'Build great things' });
  });

  it('keeps backToCurrent.href pinned to /admin/company-info', () => {
    const ui = mapToCompanyInfoHistoryDetailPageUIModel({
      translations: enCommon,
      version: version(),
      isLoading: false,
      isDenied: false,
      isNotFound: false,
      isErrored: false,
      locale: 'en-US',
    });
    expect(ui.backToCurrent.href).toBe('/admin/company-info');
    expect(ui.backToCurrent.label).toBe(enCommon.adminCompanyInfo.historyDetail.backToCurrent);
  });
});
