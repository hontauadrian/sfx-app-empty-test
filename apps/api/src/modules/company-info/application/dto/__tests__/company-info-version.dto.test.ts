import 'reflect-metadata';
import { CompanyInfoDto } from '../company-info.dto';
import {
  CompanyInfoVersionDto,
  CompanyInfoVersionsPageDto,
} from '../company-info-version.dto';

describe('CompanyInfoVersionDto', () => {
  it('can be instantiated with every documented field', () => {
    const snapshot = new CompanyInfoDto();
    snapshot.id = 'cuid-1';
    snapshot.legalName = 'Acme';
    snapshot.tradingName = null;
    snapshot.email = null;
    snapshot.phone = null;
    snapshot.website = null;
    snapshot.addressLine1 = null;
    snapshot.addressLine2 = null;
    snapshot.city = null;
    snapshot.postalCode = null;
    snapshot.country = null;
    snapshot.taxId = null;
    snapshot.registrationNumber = null;
    snapshot.companyName = null;
    snapshot.foundedYear = null;
    snapshot.teamSize = null;
    snapshot.industry = null;
    snapshot.missionStatement = null;
    snapshot.visionStatement = null;
    snapshot.coreValues = [];
    snapshot.certifications = [];
    snapshot.createdAt = new Date('2026-01-02T03:04:05.000Z');
    snapshot.updatedAt = new Date('2026-01-02T03:04:05.000Z');

    const dto = new CompanyInfoVersionDto();
    dto.id = 'v-1';
    dto.companyInfoId = 'cuid-1';
    dto.snapshot = snapshot;
    dto.editorUserId = 'subject-admin';
    dto.editorDisplayName = 'admin@example.test';
    dto.createdAt = new Date('2026-02-01T00:00:00.000Z');

    expect(dto.id).toBe('v-1');
    expect(dto.snapshot.legalName).toBe('Acme');
    expect(dto.editorUserId).toBe('subject-admin');
    expect(dto.editorDisplayName).toBe('admin@example.test');
    expect(dto.createdAt).toBeInstanceOf(Date);
  });
});

describe('CompanyInfoVersionsPageDto', () => {
  it('accepts items: [] with nextCursor: null', () => {
    const dto = new CompanyInfoVersionsPageDto();
    dto.items = [];
    dto.nextCursor = null;

    expect(dto.items).toHaveLength(0);
    expect(dto.nextCursor).toBeNull();
  });

  it('accepts items + a string nextCursor', () => {
    const item = new CompanyInfoVersionDto();
    item.id = 'v-1';
    item.companyInfoId = 'cuid-1';
    item.snapshot = new CompanyInfoDto();
    item.editorUserId = 'u';
    item.editorDisplayName = 'd';
    item.createdAt = new Date();

    const dto = new CompanyInfoVersionsPageDto();
    dto.items = [item];
    dto.nextCursor = 'next-id';

    expect(dto.items[0]?.id).toBe('v-1');
    expect(dto.nextCursor).toBe('next-id');
  });
});
