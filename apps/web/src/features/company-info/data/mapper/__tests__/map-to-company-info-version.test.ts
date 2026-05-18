import { describe, expect, it } from 'vitest';
import {
  mapToCompanyInfoVersion,
  mapToCompanyInfoVersionsPage,
} from '../map-to-company-info-version';
import type {
  CompanyInfoVersionDataModel,
  CompanyInfoVersionsPageDataModel,
} from '../../model/company-info-version-data-model';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

function snapshot(overrides: Partial<CompanyInfoDataModel> = {}): CompanyInfoDataModel {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
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
    createdAt: '2024-06-01T10:00:00.000Z',
    updatedAt: '2024-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function versionDto(overrides: Partial<CompanyInfoVersionDataModel> = {}): CompanyInfoVersionDataModel {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: snapshot(),
    editorUserId: 'user-1',
    editorDisplayName: 'Ada Lovelace',
    createdAt: '2024-06-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('mapToCompanyInfoVersion', () => {
  it('rehydrates createdAt to a Date', () => {
    const version = mapToCompanyInfoVersion(versionDto({ createdAt: '2024-06-02T10:00:00.000Z' }));
    expect(version.createdAt).toBeInstanceOf(Date);
    expect(version.createdAt.toISOString()).toBe('2024-06-02T10:00:00.000Z');
  });

  it('rehydrates snapshot.createdAt and snapshot.updatedAt via mapToCompanyInfo', () => {
    const version = mapToCompanyInfoVersion(
      versionDto({
        snapshot: snapshot({
          createdAt: '2024-05-01T00:00:00.000Z',
          updatedAt: '2024-05-02T00:00:00.000Z',
        }),
      }),
    );
    expect(version.snapshot.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.createdAt.toISOString()).toBe('2024-05-01T00:00:00.000Z');
    expect(version.snapshot.updatedAt).toBeInstanceOf(Date);
    expect(version.snapshot.updatedAt.toISOString()).toBe('2024-05-02T00:00:00.000Z');
  });

  it('passes scalar fields through unchanged', () => {
    const version = mapToCompanyInfoVersion(
      versionDto({
        id: 'v-42',
        companyInfoId: 'cid-9',
        editorUserId: 'user-9',
        editorDisplayName: 'Grace Hopper',
      }),
    );
    expect(version.id).toBe('v-42');
    expect(version.companyInfoId).toBe('cid-9');
    expect(version.editorUserId).toBe('user-9');
    expect(version.editorDisplayName).toBe('Grace Hopper');
  });
});

describe('mapToCompanyInfoVersionsPage', () => {
  it('maps each item via mapToCompanyInfoVersion and preserves a null nextCursor', () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [versionDto({ id: 'v-1' }), versionDto({ id: 'v-2' })],
      nextCursor: null,
    };
    const mapped = mapToCompanyInfoVersionsPage(page);
    expect(mapped.items).toHaveLength(2);
    expect(mapped.items[0]?.id).toBe('v-1');
    expect(mapped.items[1]?.id).toBe('v-2');
    expect(mapped.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(mapped.nextCursor).toBeNull();
  });

  it('preserves a string nextCursor when set', () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [versionDto({ id: 'v-3' })],
      nextCursor: 'v-3',
    };
    expect(mapToCompanyInfoVersionsPage(page).nextCursor).toBe('v-3');
  });

  it('returns an empty items array when given an empty page', () => {
    const mapped = mapToCompanyInfoVersionsPage({ items: [], nextCursor: null });
    expect(mapped.items).toEqual([]);
    expect(mapped.nextCursor).toBeNull();
  });
});
