import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchCompanyInfoVersionById } from '../fetch-company-info-version-by-id';
import { COMPANY_INFO_ENDPOINT } from '../../../constants';
import type { CompanyInfoVersionDataModel } from '../../model/company-info-version-data-model';

const executeRequestMock = vi.mocked(executeRequest);

function versionDto(): CompanyInfoVersionDataModel {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: {
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
      createdAt: '2024-06-01T10:00:00.000Z',
      updatedAt: '2024-06-01T10:00:00.000Z',
    },
    editorUserId: 'user-1',
    editorDisplayName: 'Ada',
    createdAt: '2024-06-02T10:00:00.000Z',
  };
}

beforeEach(() => {
  executeRequestMock.mockReset();
});

describe('fetchCompanyInfoVersionById', () => {
  it('URL-encodes the version id into the path', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: versionDto() }, status: 200 });
    await fetchCompanyInfoVersionById('v/1?weird');
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${COMPANY_INFO_ENDPOINT}/versions/${encodeURIComponent('v/1?weird')}`,
    });
  });

  it('returns the unwrapped envelope data', async () => {
    const payload = versionDto();
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: payload }, status: 200 });
    const result = await fetchCompanyInfoVersionById('v-1');
    expect(result).toEqual(payload);
  });

  it('propagates rejections from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'not found', status: 404 });
    await expect(fetchCompanyInfoVersionById('missing')).rejects.toMatchObject({ status: 404 });
  });
});
