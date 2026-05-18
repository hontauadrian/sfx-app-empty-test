import { describe, expect, it } from 'vitest';
import type { CompanyInfo } from '@sfx/domain';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { mapToCompanyInfoPageUIModel } from '../map-to-company-info-page-ui-model';

function record(): CompanyInfo {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
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

describe('mapToCompanyInfoPageUIModel', () => {
  it('returns loading status with a non-empty submit label when isLoading', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: true,
      isDenied: false,
      isPending: false,
    });
    expect(ui.status).toBe('loading');
    expect(ui.submit.label.length).toBeGreaterThan(0);
    expect(ui.submit.disabled).toBe(false);
  });

  it('returns denied status when isDenied (after loading)', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: true,
      isPending: false,
    });
    expect(ui.status).toBe('denied');
  });

  it('returns ready status with the save label when record exists', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: record(),
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.status).toBe('ready');
    expect(ui.submit.label).toBe(enCommon.adminCompanyInfo.cta.save);
  });

  it('returns ready status with the create label when record is null', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.status).toBe('ready');
    expect(ui.submit.label).toBe(enCommon.adminCompanyInfo.cta.create);
  });

  it('reports pending submit with the saving label when isPending', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: record(),
      isLoading: false,
      isDenied: false,
      isPending: true,
    });
    expect(ui.submit.label).toBe(enCommon.adminCompanyInfo.cta.saving);
    expect(ui.submit.disabled).toBe(true);
    expect(ui.submit.pending).toBe(true);
  });

  it('builds 4 sections in legalRegistration/identity/keyFacts/contact order', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.sections).toHaveLength(4);
    expect(ui.sections.map((section) => section.key)).toEqual([
      'legalRegistration',
      'identity',
      'keyFacts',
      'contact',
    ]);
  });

  it('exposes legalRegistration fields: legalName (required) + tradingName/taxId/registrationNumber', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    const section = ui.sections.find((entry) => entry.key === 'legalRegistration');
    expect(section?.fields.map((field) => field.name)).toEqual([
      'legalName',
      'tradingName',
      'taxId',
      'registrationNumber',
    ]);
    expect(section?.fields[0]?.required).toBe(true);
    expect(section?.fields.slice(1).every((field) => field.required === false)).toBe(true);
  });

  it('exposes identity fields with numeric foundedYear and teamSize', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    const identity = ui.sections.find((entry) => entry.key === 'identity');
    expect(identity?.fields.map((field) => field.name)).toEqual([
      'companyName',
      'industry',
      'foundedYear',
      'teamSize',
    ]);
    expect(identity?.fields.map((field) => field.type)).toEqual(['text', 'text', 'number', 'number']);
  });

  it('exposes keyFacts fields with textarea + array input types', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    const keyFacts = ui.sections.find((entry) => entry.key === 'keyFacts');
    expect(keyFacts?.fields.map((field) => field.name)).toEqual([
      'missionStatement',
      'visionStatement',
      'coreValues',
      'certifications',
    ]);
    expect(keyFacts?.fields.map((field) => field.type)).toEqual([
      'textarea',
      'textarea',
      'array',
      'array',
    ]);
  });

  it('exposes contact fields with email/tel/url then address scalars', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    const contact = ui.sections.find((entry) => entry.key === 'contact');
    expect(contact?.fields.map((field) => field.name)).toEqual([
      'email',
      'phone',
      'website',
      'addressLine1',
      'addressLine2',
      'city',
      'postalCode',
      'country',
    ]);
    expect(contact?.fields.map((field) => field.type)).toEqual([
      'email',
      'tel',
      'url',
      'text',
      'text',
      'text',
      'text',
      'text',
    ]);
  });

  it('populates every field with non-empty label + placeholder from translations', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    for (const section of ui.sections) {
      for (const field of section.fields) {
        expect(field.label.length).toBeGreaterThan(0);
        expect(field.placeholder.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads the denied surface copy from F3 admin denied translations', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.denied.title).toBe(enCommon.admin.denied.title);
    expect(ui.denied.message).toBe(enCommon.admin.denied.message);
    expect(ui.denied.backToHomeLabel).toBe(enCommon.admin.denied.backToHome);
    expect(ui.denied.backToHomeHref).toBe('/');
  });

  it('reads the page title from translations', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.title).toBe(enCommon.adminCompanyInfo.pageTitle);
  });

  it('exposes the View history affordance pointing at /admin/company-info/history', () => {
    const ui = mapToCompanyInfoPageUIModel({
      translations: enCommon,
      record: null,
      isLoading: false,
      isDenied: false,
      isPending: false,
    });
    expect(ui.viewHistory.href).toBe('/admin/company-info/history');
    expect(ui.viewHistory.label).toBe(enCommon.adminCompanyInfo.history.viewHistoryCta);
  });
});
