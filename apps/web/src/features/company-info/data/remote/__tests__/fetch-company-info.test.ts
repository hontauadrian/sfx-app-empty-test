import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchCompanyInfo } from '../fetch-company-info';
import { COMPANY_INFO_ENDPOINT } from '../../../constants';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

const executeRequestMock = vi.mocked(executeRequest);

beforeEach(() => {
  executeRequestMock.mockReset();
});

function dto(): CompanyInfoDataModel {
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
    createdAt: '2024-06-01T10:00:00.000Z',
    updatedAt: '2024-06-01T10:00:00.000Z',
  };
}

describe('fetchCompanyInfo', () => {
  it('unwraps the api envelope and returns the data model', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: payload }, status: 200 });
    const result = await fetchCompanyInfo();
    expect(result).toEqual(payload);
  });

  it('returns null when the envelope reports null data', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: null }, status: 200 });
    const result = await fetchCompanyInfo();
    expect(result).toBeNull();
  });

  it('propagates rejection from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'boom', status: 500 });
    await expect(fetchCompanyInfo()).rejects.toMatchObject({ status: 500 });
  });

  it('calls executeRequest against COMPANY_INFO_ENDPOINT with default GET', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: null }, status: 200 });
    await fetchCompanyInfo();
    expect(executeRequestMock).toHaveBeenCalledTimes(1);
    expect(executeRequestMock).toHaveBeenCalledWith({ path: COMPANY_INFO_ENDPOINT });
  });
});
