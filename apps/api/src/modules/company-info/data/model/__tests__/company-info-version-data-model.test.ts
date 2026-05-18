import type { CompanyInfoVersionRow } from '../company-info-version-data-model';

describe('CompanyInfoVersionRow', () => {
  it('describes the Prisma-generated CompanyInfoVersion shape', () => {
    const row: CompanyInfoVersionRow = {
      id: 'v-1',
      companyInfoId: 'cuid-1',
      snapshot: { id: 'cuid-1', legalName: 'Acme' },
      editorUserId: 'subject-admin',
      editorDisplayName: 'admin@example.test',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    };

    expect(row.id).toBe('v-1');
    expect(row.companyInfoId).toBe('cuid-1');
    expect(row.editorUserId).toBe('subject-admin');
    expect(row.editorDisplayName).toBe('admin@example.test');
    expect(row.createdAt).toBeInstanceOf(Date);
  });
});
