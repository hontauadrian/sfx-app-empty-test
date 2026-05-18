import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-company-info', () => ({
  fetchCompanyInfo: vi.fn(),
}));

vi.mock('../../remote/update-company-info', () => ({
  updateCompanyInfo: vi.fn(),
}));

import { fetchCompanyInfo } from '../../remote/fetch-company-info';
import { updateCompanyInfo } from '../../remote/update-company-info';
import { useCompanyInfoRepository } from '../use-company-info-repository';
import { COMPANY_INFO_QUERY_KEY } from '../../../constants';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

const fetchCompanyInfoMock = vi.mocked(fetchCompanyInfo);
const updateCompanyInfoMock = vi.mocked(updateCompanyInfo);

function dto(overrides: Partial<CompanyInfoDataModel> = {}): CompanyInfoDataModel {
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
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe('useCompanyInfoRepository', () => {
  beforeEach(() => {
    fetchCompanyInfoMock.mockReset();
    updateCompanyInfoMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the mapped CompanyInfo entity when the api returns a record', async () => {
    fetchCompanyInfoMock.mockResolvedValueOnce(dto());
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.companyInfoQuery.isSuccess).toBe(true);
    });
    expect(result.current.companyInfoQuery.data).toMatchObject({
      id: 'cid-1',
      legalName: 'Acme',
    });
    expect(result.current.companyInfoQuery.data?.createdAt).toBeInstanceOf(Date);
  });

  it('exposes null when the api returns null', async () => {
    fetchCompanyInfoMock.mockResolvedValueOnce(null);
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.companyInfoQuery.isSuccess).toBe(true);
    });
    expect(result.current.companyInfoQuery.data).toBeNull();
  });

  it('reports isError when fetch rejects', async () => {
    fetchCompanyInfoMock.mockRejectedValueOnce({ message: 'boom', status: 500 });
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.companyInfoQuery.isError).toBe(true);
    });
    expect(fetchCompanyInfoMock).toHaveBeenCalledTimes(1);
  });

  it('honors retry:false (single fetch attempt on rejection)', async () => {
    fetchCompanyInfoMock.mockRejectedValue({ message: 'boom', status: 500 });
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.companyInfoQuery.isError).toBe(true);
    });
    expect(fetchCompanyInfoMock).toHaveBeenCalledTimes(1);
  });

  it('upsertMutation calls updateCompanyInfo once and resolves with mapped CompanyInfo', async () => {
    updateCompanyInfoMock.mockResolvedValueOnce(dto({ legalName: 'Renamed' }));
    fetchCompanyInfoMock.mockResolvedValue(null);
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });

    let saved;
    await act(async () => {
      saved = await result.current.upsertMutation.mutateAsync({ legalName: 'Renamed' });
    });

    expect(updateCompanyInfoMock).toHaveBeenCalledTimes(1);
    expect(updateCompanyInfoMock).toHaveBeenCalledWith({ legalName: 'Renamed' });
    expect(saved).toMatchObject({ legalName: 'Renamed' });
    expect(saved && (saved as { createdAt: Date }).createdAt).toBeInstanceOf(Date);
  });

  it('onSuccess writes the mapped CompanyInfo into the cache under COMPANY_INFO_QUERY_KEY', async () => {
    updateCompanyInfoMock.mockResolvedValueOnce(dto({ legalName: 'Cached' }));
    fetchCompanyInfoMock.mockResolvedValue(null);
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.upsertMutation.mutateAsync({ legalName: 'Cached' });
    });

    const cached = client.getQueryData(COMPANY_INFO_QUERY_KEY);
    expect(cached).toMatchObject({ legalName: 'Cached' });
    expect((cached as { createdAt: Date }).createdAt).toBeInstanceOf(Date);
  });

  it('onSuccess invalidates the company-info query', async () => {
    updateCompanyInfoMock.mockResolvedValueOnce(dto());
    fetchCompanyInfoMock.mockResolvedValue(null);
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.upsertMutation.mutateAsync({ legalName: 'Acme' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: COMPANY_INFO_QUERY_KEY }),
    );
  });

  it('upsertMutation propagates rejection unchanged', async () => {
    updateCompanyInfoMock.mockRejectedValueOnce({ message: 'Validation failed', status: 400, errors: [{ field: 'legalName', message: 'Required' }] });
    fetchCompanyInfoMock.mockResolvedValue(null);
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });

    await expect(async () => {
      await act(async () => {
        await result.current.upsertMutation.mutateAsync({ legalName: '' });
      });
    }).rejects.toMatchObject({ status: 400, message: 'Validation failed' });
  });
});
