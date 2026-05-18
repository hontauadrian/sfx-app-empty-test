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

vi.mock('../../../../data/repositories/use-company-info-versions-repository', () => ({
  useCompanyInfoVersionsRepository: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';
import { useCompanyInfoVersionsRepository } from '../../../../data/repositories/use-company-info-versions-repository';
import { useCompanyInfoHistory } from '../use-company-info-history';

const useTranslationsMock = vi.mocked(useTranslations);
const useVersionsRepoMock = vi.mocked(useCompanyInfoVersionsRepository);

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <LanguageProvider defaultLanguage="en">
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LanguageProvider>
    );
  };
}

type RepoReturn = ReturnType<typeof useCompanyInfoVersionsRepository>;

function repoState(overrides: Partial<RepoReturn['versionsPageQuery']>): RepoReturn {
  const base = {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    isFetching: false,
    isLoadingError: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isStale: false,
    isFetched: false,
    isFetchedAfterMount: false,
    fetchStatus: 'idle',
    status: 'pending',
    refetch: vi.fn(),
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    ...overrides,
  } as unknown as RepoReturn['versionsPageQuery'];
  return { versionsPageQuery: base };
}

beforeEach(() => {
  useTranslationsMock.mockReturnValue(enCommon);
  useVersionsRepoMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCompanyInfoHistory', () => {
  it('reports "loading" status while the repository query is loading', async () => {
    useVersionsRepoMock.mockReturnValue(repoState({ isLoading: true }));
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: wrapper(createClient()) });
    expect(result.current.uiModel.status).toBe('loading');
  });

  it('reports "ready" status with mapped rows when versions are returned', async () => {
    useVersionsRepoMock.mockReturnValue(
      repoState({
        isSuccess: true,
        data: {
          items: [
            {
              id: 'v-1',
              companyInfoId: 'cid-1',
              editorUserId: 'user-1',
              editorDisplayName: 'Ada',
              createdAt: new Date('2024-06-02T10:00:00.000Z'),
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
                createdAt: new Date('2024-06-01T10:00:00.000Z'),
                updatedAt: new Date('2024-06-01T10:00:00.000Z'),
              },
            },
          ],
          nextCursor: null,
        },
      }),
    );
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: wrapper(createClient()) });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    expect(result.current.uiModel.rows).toHaveLength(1);
    expect(result.current.uiModel.rows[0]?.editorLabel).toBe('Ada');
  });

  it('reports "empty" status when the repository returns no items', async () => {
    useVersionsRepoMock.mockReturnValue(
      repoState({ isSuccess: true, data: { items: [], nextCursor: null } }),
    );
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: wrapper(createClient()) });
    expect(result.current.uiModel.status).toBe('empty');
  });

  it('reports "denied" status when error.status === 403', async () => {
    useVersionsRepoMock.mockReturnValue(
      repoState({ isError: true, error: { message: 'Forbidden', status: 403 } as unknown as Error }),
    );
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: wrapper(createClient()) });
    expect(result.current.uiModel.status).toBe('denied');
  });

  it('reports "error" status for non-403 errors', async () => {
    useVersionsRepoMock.mockReturnValue(
      repoState({ isError: true, error: { message: 'boom', status: 500 } as unknown as Error }),
    );
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: wrapper(createClient()) });
    expect(result.current.uiModel.status).toBe('error');
  });
});
