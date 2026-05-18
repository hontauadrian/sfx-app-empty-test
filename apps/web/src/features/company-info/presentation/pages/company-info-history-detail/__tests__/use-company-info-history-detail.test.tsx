import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/presentation/localization', async () => {
  const actual = await vi.importActual<typeof import('@/features/presentation/localization')>(
    '@/features/presentation/localization',
  );
  return {
    ...actual,
    useTranslations: vi.fn(),
  };
});

vi.mock('../../../../data/repositories/use-company-info-version-repository', () => ({
  useCompanyInfoVersionRepository: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';
import { useCompanyInfoVersionRepository } from '../../../../data/repositories/use-company-info-version-repository';
import { useCompanyInfoHistoryDetail } from '../use-company-info-history-detail';
import type { CompanyInfo, CompanyInfoVersion } from '@sfx/domain';

const useTranslationsMock = vi.mocked(useTranslations);
const useVersionRepoMock = vi.mocked(useCompanyInfoVersionRepository);

function snapshot(overrides: Partial<CompanyInfo> = {}): CompanyInfo {
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
    createdAt: new Date('2024-06-01T10:00:00.000Z'),
    updatedAt: new Date('2024-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

function makeVersion(overrides: Partial<CompanyInfoVersion> = {}): CompanyInfoVersion {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: snapshot(),
    editorUserId: 'user-1',
    editorDisplayName: 'Ada Lovelace',
    createdAt: new Date('2024-06-02T10:00:00.000Z'),
    ...overrides,
  };
}

type RepoReturn = ReturnType<typeof useCompanyInfoVersionRepository>;

function repoState(overrides: Partial<RepoReturn['versionQuery']>): RepoReturn {
  const base = {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    isFetching: false,
    fetchStatus: 'idle',
    status: 'pending',
    refetch: vi.fn(),
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    ...overrides,
  } as unknown as RepoReturn['versionQuery'];
  return { versionQuery: base };
}

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(qc: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <LanguageProvider defaultLanguage="en">
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </LanguageProvider>
    );
  };
}

beforeEach(() => {
  useTranslationsMock.mockReturnValue(enCommon);
  useVersionRepoMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCompanyInfoHistoryDetail', () => {
  it('reports "loading" while the query is pending', () => {
    useVersionRepoMock.mockReturnValue(repoState({ isLoading: true }));
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: wrapper(client()),
    });
    expect(result.current.uiModel.status).toBe('loading');
  });

  it('reports "ready" with wired-in sections when data is present', async () => {
    useVersionRepoMock.mockReturnValue(repoState({ isSuccess: true, data: makeVersion() }));
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    expect(result.current.uiModel.banner.message).toContain('Ada Lovelace');
    expect(result.current.uiModel.sections).toHaveLength(4);
  });

  it('reports "not-found" on 404', () => {
    useVersionRepoMock.mockReturnValue(
      repoState({ isError: true, error: { status: 404, message: 'not found' } as unknown as Error }),
    );
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'missing' }), {
      wrapper: wrapper(client()),
    });
    expect(result.current.uiModel.status).toBe('not-found');
  });

  it('reports "denied" on 403', () => {
    useVersionRepoMock.mockReturnValue(
      repoState({ isError: true, error: { status: 403, message: 'Forbidden' } as unknown as Error }),
    );
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: wrapper(client()),
    });
    expect(result.current.uiModel.status).toBe('denied');
  });

  it('reports "error" on generic failures', () => {
    useVersionRepoMock.mockReturnValue(
      repoState({ isError: true, error: { status: 500, message: 'boom' } as unknown as Error }),
    );
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: wrapper(client()),
    });
    expect(result.current.uiModel.status).toBe('error');
  });

  it('reports "loading" when versionId is empty', () => {
    useVersionRepoMock.mockReturnValue(repoState({ isLoading: false }));
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: '' }), {
      wrapper: wrapper(client()),
    });
    expect(result.current.uiModel.status).toBe('loading');
  });
});
