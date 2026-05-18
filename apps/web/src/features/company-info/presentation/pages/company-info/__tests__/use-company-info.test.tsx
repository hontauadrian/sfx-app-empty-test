import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

vi.mock('@/features/presentation/toast', () => ({
  useToast: vi.fn(),
}));

vi.mock('../../../../data/repositories/use-company-info-repository', () => ({
  useCompanyInfoRepository: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { AUTH_SESSION_QUERY_KEY } from '@/features/auth/constants';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { useCompanyInfoRepository } from '../../../../data/repositories/use-company-info-repository';
import { useCompanyInfo } from '../use-company-info';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { CompanyInfo, UpsertCompanyInfoInput } from '@sfx/domain';

type RepoReturn = {
  companyInfoQuery: UseQueryResult<CompanyInfo | null>;
  upsertMutation: UseMutationResult<CompanyInfo, unknown, UpsertCompanyInfoInput, unknown>;
};

const useTranslationsMock = vi.mocked(useTranslations);
const useToastMock = vi.mocked(useToast);
const useCompanyInfoRepositoryMock = vi.mocked(useCompanyInfoRepository);

function record(overrides: Partial<CompanyInfo> = {}): CompanyInfo {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
    email: 'contact@acme.test',
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

function buildQuery(overrides: Partial<UseQueryResult<CompanyInfo | null>>): UseQueryResult<CompanyInfo | null> {
  return {
    data: null,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    status: 'success',
    ...overrides,
  } as UseQueryResult<CompanyInfo | null>;
}

function buildMutation(
  overrides: Partial<UseMutationResult<CompanyInfo, unknown, UpsertCompanyInfoInput, unknown>>,
): UseMutationResult<CompanyInfo, unknown, UpsertCompanyInfoInput, unknown> {
  return {
    mutateAsync: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isIdle: true,
    isSuccess: false,
    reset: vi.fn(),
    status: 'idle',
    ...overrides,
  } as unknown as UseMutationResult<CompanyInfo, unknown, UpsertCompanyInfoInput, unknown>;
}

function createWrapper(): { wrapper: (props: { children: ReactNode }) => ReactNode; client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { wrapper: Wrapper, client };
}

const pushSuccess = vi.fn();
const pushError = vi.fn();
const dismiss = vi.fn();

beforeEach(() => {
  useTranslationsMock.mockReturnValue(enCommon);
  useToastMock.mockReturnValue({ success: pushSuccess, error: pushError, dismiss });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useCompanyInfo', () => {
  it('passes loading through to the uiModel', () => {
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: undefined, isLoading: true, isSuccess: false, status: 'pending' }),
      upsertMutation: buildMutation({}),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });
    expect(result.current.uiModel.status).toBe('loading');
  });

  it('reports ready with create label when record is null', () => {
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({}),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });
    expect(result.current.uiModel.status).toBe('ready');
    expect(result.current.uiModel.submit.label).toBe(enCommon.adminCompanyInfo.cta.create);
    expect(result.current.form.getValues('legalName')).toBe('');
  });

  it('resets the form to populated values when record arrives', async () => {
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: record() }),
      upsertMutation: buildMutation({}),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });
    await waitFor(() => {
      expect(result.current.form.getValues('legalName')).toBe('Acme Holdings SRL');
    });
    expect(result.current.form.getValues('email')).toBe('contact@acme.test');
    expect(result.current.uiModel.submit.label).toBe(enCommon.adminCompanyInfo.cta.save);
  });

  it('reports denied status when query error is a 403', () => {
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ isLoading: false, isError: true, isSuccess: false, status: 'error', error: { status: 403, message: 'Forbidden' } as unknown as Error }),
      upsertMutation: buildMutation({}),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });
    expect(result.current.uiModel.status).toBe('denied');
  });

  it('handleSubmit on valid input mutates with normalized values and pushes a success toast', async () => {
    const saved = record({ legalName: 'Updated' });
    const mutateAsync = vi.fn().mockResolvedValueOnce(saved);
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'Updated');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      legalName: 'Updated',
      tradingName: null,
      taxId: null,
      registrationNumber: null,
      companyName: null,
      industry: null,
      foundedYear: null,
      teamSize: null,
      missionStatement: null,
      visionStatement: null,
      coreValues: [],
      certifications: [],
      email: null,
      phone: null,
      website: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      country: null,
    });
    expect(pushSuccess).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.success);
    expect(result.current.form.getValues('legalName')).toBe('Updated');
  });

  it('trims array entries and drops empty rows on submit', async () => {
    const saved = record({ legalName: 'Updated', coreValues: ['Integrity', 'Craft'] });
    const mutateAsync = vi.fn().mockResolvedValueOnce(saved);
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'Updated');
      result.current.form.setValue('coreValues', ['Integrity', ' Craft ', '']);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0]?.[0].coreValues).toEqual(['Integrity', 'Craft']);
  });

  it('coerces numeric inputs and forwards them on submit', async () => {
    const saved = record({ legalName: 'Updated', foundedYear: 1998 });
    const mutateAsync = vi.fn().mockResolvedValueOnce(saved);
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'Updated');
      result.current.form.setValue('foundedYear', 1998);
      result.current.form.setValue('teamSize', 42);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0]?.[0].foundedYear).toBe(1998);
    expect(mutateAsync.mock.calls[0]?.[0].teamSize).toBe(42);
  });

  it('routes 400 with field errors to form.setError without a toast', async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce({
      status: 400,
      message: 'Validation failed',
      errors: [
        { field: 'legalName', message: 'Legal name is required' },
        { field: 'email', message: 'Invalid email address' },
      ],
    });
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'Anything');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushSuccess).not.toHaveBeenCalled();
    expect(pushError).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.form.getFieldState('legalName').error?.message).toBe(
        'Legal name is required',
      );
    });
    expect(result.current.form.getFieldState('email').error?.message).toBe('Invalid email address');
  });

  it('routes 401 to auth toast and invalidates the auth session query', async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce({ status: 401, message: 'Unauthorized' });
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper, client } = createWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'X');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: AUTH_SESSION_QUERY_KEY });
    expect(pushError).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.authError);
    expect(pushSuccess).not.toHaveBeenCalled();
  });

  it('routes 403 to auth toast without invalidating the auth session query', async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce({ status: 403, message: 'Forbidden' });
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper, client } = createWrapper();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'X');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: AUTH_SESSION_QUERY_KEY });
    expect(pushError).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.authError);
  });

  it('routes 5xx to unexpected error toast', async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce({ status: 500, message: 'Boom' });
    useCompanyInfoRepositoryMock.mockReturnValue({
      companyInfoQuery: buildQuery({ data: null }),
      upsertMutation: buildMutation({ mutateAsync }),
    } as RepoReturn);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper });

    act(() => {
      result.current.form.setValue('legalName', 'X');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushError).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.unexpectedError);
  });
});
