import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-company-info-version-by-id', () => ({
  fetchCompanyInfoVersionById: vi.fn(),
}));

import { fetchCompanyInfoVersionById } from '../../remote/fetch-company-info-version-by-id';
import { useCompanyInfoVersionRepository } from '../use-company-info-version-repository';
import type { CompanyInfoVersionDataModel } from '../../model/company-info-version-data-model';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

const fetchCompanyInfoVersionByIdMock = vi.mocked(fetchCompanyInfoVersionById);

function snapshot(): CompanyInfoDataModel {
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

function versionDto(overrides: Partial<CompanyInfoVersionDataModel> = {}): CompanyInfoVersionDataModel {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: snapshot(),
    editorUserId: 'user-1',
    editorDisplayName: 'Ada Lovelace',
    createdAt: '2024-06-02T10:00:00.000Z',
    ...overrides,
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

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  fetchCompanyInfoVersionByIdMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCompanyInfoVersionRepository', () => {
  it('exposes the mapped version when the api returns a record', async () => {
    fetchCompanyInfoVersionByIdMock.mockResolvedValueOnce(versionDto());
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionRepository('v-1'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionQuery.isSuccess).toBe(true);
    });
    expect(result.current.versionQuery.data?.id).toBe('v-1');
    expect(result.current.versionQuery.data?.createdAt).toBeInstanceOf(Date);
    expect(result.current.versionQuery.data?.snapshot.createdAt).toBeInstanceOf(Date);
  });

  it('surfaces 404 errors without retrying', async () => {
    fetchCompanyInfoVersionByIdMock.mockRejectedValue({ message: 'not found', status: 404 });
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionRepository('missing'), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionQuery.isError).toBe(true);
    });
    expect(fetchCompanyInfoVersionByIdMock).toHaveBeenCalledTimes(1);
  });

  it('is disabled when id is empty (no remote call)', async () => {
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionRepository(''), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionQuery.fetchStatus).toBe('idle');
    });
    expect(fetchCompanyInfoVersionByIdMock).not.toHaveBeenCalled();
  });
});
