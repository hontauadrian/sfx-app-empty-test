import { describe, expect, it } from 'vitest';
import * as domain from '../../index';
import type { CompanyInfo } from '../company-info';
import type {
  CompanyInfoVersion,
  ListCompanyInfoVersionsInput,
  ListCompanyInfoVersionsResult,
} from '../company-info-version';

const buildSnapshot = (): CompanyInfo => ({
  id: 'cuid-info',
  legalName: 'Acme Holdings SRL',
  tradingName: 'Acme',
  email: 'hello@acme.example',
  phone: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  country: null,
  taxId: null,
  registrationNumber: null,
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
});

describe('CompanyInfoVersion', () => {
  it('is a type-only export with no runtime value on the barrel', () => {
    expect((domain as Record<string, unknown>).CompanyInfoVersion).toBeUndefined();
  });

  it('compiles with every field populated and a full CompanyInfo snapshot', () => {
    const snapshot = buildSnapshot();
    const version: CompanyInfoVersion = {
      id: 'clxyzversion0000000001',
      companyInfoId: snapshot.id,
      snapshot,
      editorUserId: 'auth-user-abc',
      editorDisplayName: 'admin@example.com',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    };

    expect(version.snapshot.id).toBe('cuid-info');
    expect(version.snapshot.legalName).toBe('Acme Holdings SRL');
    expect(version.snapshot.coreValues).toEqual(['Integrity', 'Craft']);
    expect(version.editorUserId).toBe('auth-user-abc');
    expect(version.createdAt).toBeInstanceOf(Date);
  });

  it('type-only check: TS rejects null for snapshot', () => {
    const version: CompanyInfoVersion = {
      id: 'v',
      companyInfoId: 'c',
      // @ts-expect-error snapshot must be CompanyInfo, not null
      snapshot: null,
      editorUserId: 'u',
      editorDisplayName: 'd',
      createdAt: new Date(),
    };

    expect(version.snapshot).toBeNull();
  });
});

describe('ListCompanyInfoVersionsInput', () => {
  it('accepts take only', () => {
    const input: ListCompanyInfoVersionsInput = { take: 50 };
    expect(input.take).toBe(50);
    expect(input.cursor).toBeUndefined();
  });

  it('accepts take + cursor', () => {
    const input: ListCompanyInfoVersionsInput = { take: 50, cursor: 'abc' };
    expect(input.cursor).toBe('abc');
  });
});

describe('ListCompanyInfoVersionsResult', () => {
  it('accepts items: [] with nextCursor: null', () => {
    const result: ListCompanyInfoVersionsResult = { items: [], nextCursor: null };
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it('accepts populated items + string nextCursor', () => {
    const snapshot = buildSnapshot();
    const v1: CompanyInfoVersion = {
      id: 'v1',
      companyInfoId: snapshot.id,
      snapshot,
      editorUserId: 'u',
      editorDisplayName: 'd',
      createdAt: new Date(),
    };
    const v2: CompanyInfoVersion = {
      id: 'v2',
      companyInfoId: snapshot.id,
      snapshot,
      editorUserId: 'u',
      editorDisplayName: 'd',
      createdAt: new Date(),
    };

    const result: ListCompanyInfoVersionsResult = {
      items: [v1, v2],
      nextCursor: 'v2',
    };
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('v2');
  });
});
