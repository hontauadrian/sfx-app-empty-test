import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-company-info-versions', () => ({
  fetchCompanyInfoVersions: vi.fn(),
}));

import { fetchCompanyInfoVersions } from '../../remote/fetch-company-info-versions';
import { useCompanyInfoVersionsRepository } from '../use-company-info-versions-repository';
import type {
  CompanyInfoVersionDataModel,
  CompanyInfoVersionsPageDataModel,
} from '../../model/company-info-version-data-model';
import type { CompanyInfoDataModel } from '../../model/company-info-data-model';

const fetchCompanyInfoVersionsMock = vi.mocked(fetchCompanyInfoVersions);

function snapshot(overrides: Partial<CompanyInfoDataModel> = {}): CompanyInfoDataModel {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
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
    ...overrides,
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
  fetchCompanyInfoVersionsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCompanyInfoVersionsRepository', () => {
  it('exposes the mapped page when the api returns items', async () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [versionDto({ id: 'v-1' }), versionDto({ id: 'v-2' })],
      nextCursor: null,
    };
    fetchCompanyInfoVersionsMock.mockResolvedValueOnce(page);

    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionsPageQuery.isSuccess).toBe(true);
    });
    expect(result.current.versionsPageQuery.data?.items).toHaveLength(2);
    expect(result.current.versionsPageQuery.data?.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.current.versionsPageQuery.data?.nextCursor).toBeNull();
  });

  it('preserves nextCursor when present', async () => {
    const page: CompanyInfoVersionsPageDataModel = {
      items: [versionDto({ id: 'v-7' })],
      nextCursor: 'v-7',
    };
    fetchCompanyInfoVersionsMock.mockResolvedValueOnce(page);
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionsPageQuery.isSuccess).toBe(true);
    });
    expect(result.current.versionsPageQuery.data?.nextCursor).toBe('v-7');
  });

  it('propagates errors and respects retry:false', async () => {
    fetchCompanyInfoVersionsMock.mockRejectedValue({ message: 'boom', status: 500 });
    const client = createTestClient();
    const { result } = renderHook(() => useCompanyInfoVersionsRepository(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.versionsPageQuery.isError).toBe(true);
    });
    expect(fetchCompanyInfoVersionsMock).toHaveBeenCalledTimes(1);
  });

  it('uses distinct cache keys for different take values', async () => {
    fetchCompanyInfoVersionsMock.mockResolvedValue({ items: [], nextCursor: null });
    const client = createTestClient();
    renderHook(() => useCompanyInfoVersionsRepository({ take: 10 }), {
      wrapper: createWrapper(client),
    });
    renderHook(() => useCompanyInfoVersionsRepository({ take: 50 }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(fetchCompanyInfoVersionsMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchCompanyInfoVersionsMock).toHaveBeenNthCalledWith(1, { take: 10 });
    expect(fetchCompanyInfoVersionsMock).toHaveBeenNthCalledWith(2, { take: 50 });
  });

  it('forwards cursor to the remote when given', async () => {
    fetchCompanyInfoVersionsMock.mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = createTestClient();
    renderHook(() => useCompanyInfoVersionsRepository({ take: 10, cursor: 'v-1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(fetchCompanyInfoVersionsMock).toHaveBeenCalledWith({ take: 10, cursor: 'v-1' });
    });
  });
});
