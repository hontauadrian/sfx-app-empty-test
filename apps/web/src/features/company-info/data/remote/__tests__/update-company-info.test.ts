import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import type { UpsertCompanyInfoInput } from '@sfx/domain';
import { updateCompanyInfo } from '../update-company-info';
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
    updatedAt: '2024-06-02T10:00:00.000Z',
  };
}

describe('updateCompanyInfo', () => {
  it('issues PUT against COMPANY_INFO_ENDPOINT with verbatim body and returns the dto', async () => {
    const payload = dto();
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: payload }, status: 200 });
    const input: UpsertCompanyInfoInput = { legalName: 'Acme', email: 'contact@acme.test' };

    const result = await updateCompanyInfo(input);

    expect(result).toEqual(payload);
    expect(executeRequestMock).toHaveBeenCalledTimes(1);
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: COMPANY_INFO_ENDPOINT,
      method: 'PUT',
      body: input,
    });
  });

  it('propagates rejection (e.g. 400 with field errors) from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({
      message: 'Validation failed',
      status: 400,
      errors: [{ field: 'legalName', message: 'Legal name is required' }],
    });

    await expect(updateCompanyInfo({ legalName: '' })).rejects.toMatchObject({
      message: 'Validation failed',
      status: 400,
      errors: [{ field: 'legalName', message: 'Legal name is required' }],
    });
  });
});
