import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/presentation/networking', () => ({
  executeRequest: vi.fn(),
}));

import { executeRequest } from '@/features/presentation/networking';
import { fetchCompanyInfoVersions } from '../fetch-company-info-versions';
import { COMPANY_INFO_ENDPOINT } from '../../../constants';
import type { CompanyInfoVersionsPageDataModel } from '../../model/company-info-version-data-model';

const executeRequestMock = vi.mocked(executeRequest);

function emptyPage(): CompanyInfoVersionsPageDataModel {
  return { items: [], nextCursor: null };
}

beforeEach(() => {
  executeRequestMock.mockReset();
});

describe('fetchCompanyInfoVersions', () => {
  it('calls executeRequest against /versions without a querystring when no params are provided', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage() }, status: 200 });
    await fetchCompanyInfoVersions();
    expect(executeRequestMock).toHaveBeenCalledWith({ path: `${COMPANY_INFO_ENDPOINT}/versions` });
  });

  it('appends take only when provided', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage() }, status: 200 });
    await fetchCompanyInfoVersions({ take: 25 });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${COMPANY_INFO_ENDPOINT}/versions?take=25`,
    });
  });

  it('appends both take and cursor when provided', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage() }, status: 200 });
    await fetchCompanyInfoVersions({ take: 10, cursor: 'v-1' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${COMPANY_INFO_ENDPOINT}/versions?take=10&cursor=v-1`,
    });
  });

  it('appends cursor alone when take is omitted', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage() }, status: 200 });
    await fetchCompanyInfoVersions({ cursor: 'v-9' });
    expect(executeRequestMock).toHaveBeenCalledWith({
      path: `${COMPANY_INFO_ENDPOINT}/versions?cursor=v-9`,
    });
  });

  it('returns the unwrapped envelope data', async () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [],
      nextCursor: 'v-7',
    };
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: page }, status: 200 });
    const result = await fetchCompanyInfoVersions();
    expect(result).toEqual(page);
  });

  it('propagates rejections from executeRequest', async () => {
    executeRequestMock.mockRejectedValueOnce({ message: 'boom', status: 500 });
    await expect(fetchCompanyInfoVersions()).rejects.toMatchObject({ status: 500 });
  });

  it('ignores non-finite take and empty cursor', async () => {
    executeRequestMock.mockResolvedValueOnce({ data: { success: true, data: emptyPage() }, status: 200 });
    await fetchCompanyInfoVersions({ take: Number.NaN, cursor: '' });
    expect(executeRequestMock).toHaveBeenCalledWith({ path: `${COMPANY_INFO_ENDPOINT}/versions` });
  });
});
