import type { CompanyInfo } from '@sfx/domain';
import type { CompanyInfoVersionRow } from '../../model/company-info-version-data-model';
import {
  toCompanyInfoVersion,
  toVersionSnapshotJson,
} from '../company-info-version.mapper';

const buildCompanyInfo = (overrides: Partial<CompanyInfo> = {}): CompanyInfo => ({
  id: 'cuid-1',
  legalName: 'Acme Holdings SRL',
  tradingName: 'Acme',
  email: 'hello@acme.example',
  phone: '+40 21 555 0000',
  website: 'https://acme.example',
  addressLine1: '12 High St',
  addressLine2: 'Suite 4',
  city: 'Bucharest',
  postalCode: '010101',
  country: 'Romania',
  taxId: 'RO12345678',
  registrationNumber: 'J40/1234/2020',
  companyName: 'Acme Display',
  foundedYear: 1998,
  teamSize: 42,
  industry: 'Manufacturing',
  missionStatement: 'M',
  visionStatement: 'V',
  coreValues: ['Integrity', 'Craft'],
  certifications: ['ISO 9001'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

describe('toVersionSnapshotJson', () => {
  it('produces a plain object with every CompanyInfo field present', () => {
    const info = buildCompanyInfo();
    const snapshot = toVersionSnapshotJson(info);

    expect(snapshot.id).toBe(info.id);
    expect(snapshot.legalName).toBe(info.legalName);
    expect(snapshot.companyName).toBe(info.companyName);
    expect(snapshot.foundedYear).toBe(info.foundedYear);
    expect(snapshot.teamSize).toBe(info.teamSize);
    expect(snapshot.industry).toBe(info.industry);
    expect(snapshot.missionStatement).toBe(info.missionStatement);
    expect(snapshot.visionStatement).toBe(info.visionStatement);
    expect(snapshot.coreValues).toEqual(['Integrity', 'Craft']);
    expect(snapshot.certifications).toEqual(['ISO 9001']);
  });

  it('serialises createdAt and updatedAt as ISO strings', () => {
    const info = buildCompanyInfo();
    const snapshot = toVersionSnapshotJson(info);

    expect(snapshot.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(snapshot.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('copies arrays by value (mutating source does not mutate snapshot)', () => {
    const info = buildCompanyInfo({ coreValues: ['A'] });
    const snapshot = toVersionSnapshotJson(info);
    (info.coreValues as string[]).push('B');

    expect(snapshot.coreValues).toEqual(['A']);
  });
});

describe('toCompanyInfoVersion', () => {
  const baseRow = (overrides: Partial<CompanyInfoVersionRow> = {}): CompanyInfoVersionRow => ({
    id: 'v-1',
    companyInfoId: 'cuid-1',
    snapshot: toVersionSnapshotJson(buildCompanyInfo()) as CompanyInfoVersionRow['snapshot'],
    editorUserId: 'subject-admin',
    editorDisplayName: 'admin@example.test',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  });

  it('re-hydrates the snapshot ISO strings to Date instances', () => {
    const version = toCompanyInfoVersion(baseRow());

    expect(version.snapshot.createdAt).toBeInstanceOf(Date);
    expect(version.snapshot.updatedAt).toBeInstanceOf(Date);
    expect(version.snapshot.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(version.snapshot.updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('round-trips: toCompanyInfoVersion(toVersionSnapshotJson(info)) preserves the snapshot', () => {
    const original = buildCompanyInfo();
    const row = baseRow({
      snapshot: toVersionSnapshotJson(original) as CompanyInfoVersionRow['snapshot'],
    });

    const version = toCompanyInfoVersion(row);
    expect(version.snapshot).toEqual(original);
  });

  it('defaults coreValues/certifications to [] when missing', () => {
    const row = baseRow({
      snapshot: {
        id: 'cuid-1',
        legalName: 'Bare',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      } as CompanyInfoVersionRow['snapshot'],
    });

    const version = toCompanyInfoVersion(row);
    expect(version.snapshot.coreValues).toEqual([]);
    expect(version.snapshot.certifications).toEqual([]);
  });

  it('re-hydrates null scalar fields to null', () => {
    const row = baseRow({
      snapshot: {
        id: 'cuid-1',
        legalName: 'Bare',
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
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      } as CompanyInfoVersionRow['snapshot'],
    });

    const version = toCompanyInfoVersion(row);
    expect(version.snapshot.tradingName).toBeNull();
    expect(version.snapshot.companyName).toBeNull();
    expect(version.snapshot.foundedYear).toBeNull();
    expect(version.snapshot.teamSize).toBeNull();
    expect(version.snapshot.industry).toBeNull();
    expect(version.snapshot.missionStatement).toBeNull();
    expect(version.snapshot.visionStatement).toBeNull();
  });

  it('preserves the version-level editor attribution and createdAt', () => {
    const row = baseRow({
      editorUserId: 'subject-other',
      editorDisplayName: 'viewer@example.test',
      createdAt: new Date('2026-03-15T12:00:00.000Z'),
    });

    const version = toCompanyInfoVersion(row);
    expect(version.editorUserId).toBe('subject-other');
    expect(version.editorDisplayName).toBe('viewer@example.test');
    expect(version.createdAt.toISOString()).toBe('2026-03-15T12:00:00.000Z');
  });
});
