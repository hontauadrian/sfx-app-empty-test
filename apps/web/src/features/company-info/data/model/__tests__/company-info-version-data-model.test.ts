import { describe, expect, it } from 'vitest';
import type {
  CompanyInfoVersionDataModel,
  CompanyInfoVersionsPageDataModel,
} from '../company-info-version-data-model';
import type { CompanyInfoDataModel } from '../company-info-data-model';

function snapshot(): CompanyInfoDataModel {
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
    updatedAt: '2024-06-02T10:00:00.000Z',
  };
}

describe('CompanyInfoVersionDataModel', () => {
  it('describes every wire field including ISO date strings and the nested snapshot', () => {
    const example: CompanyInfoVersionDataModel = {
      id: 'v-1',
      companyInfoId: 'cid-1',
      snapshot: snapshot(),
      editorUserId: 'user-1',
      editorDisplayName: 'Ada Lovelace',
      createdAt: '2024-06-02T10:00:00.000Z',
    };
    expect(example.id).toBe('v-1');
    expect(typeof example.createdAt).toBe('string');
    expect(example.snapshot.id).toBe('cid-1');
  });
});

describe('CompanyInfoVersionsPageDataModel', () => {
  it('describes a page envelope with items and nullable nextCursor', () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [],
      nextCursor: null,
    };
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it('accepts a string nextCursor when more pages remain', () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [
        {
          id: 'v-1',
          companyInfoId: 'cid-1',
          snapshot: snapshot(),
          editorUserId: 'user-1',
          editorDisplayName: 'Ada',
          createdAt: '2024-06-02T10:00:00.000Z',
        },
      ],
      nextCursor: 'v-1',
    };
    expect(page.nextCursor).toBe('v-1');
    expect(page.items[0]?.id).toBe('v-1');
  });
});
