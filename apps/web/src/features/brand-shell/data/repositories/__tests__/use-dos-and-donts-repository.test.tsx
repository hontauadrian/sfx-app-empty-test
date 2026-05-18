import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../remote/fetch-dos-and-donts', () => ({ fetchDosAndDonts: vi.fn() }));
vi.mock('../../remote/create-dos-donts-entry', () => ({ createDosDontsEntry: vi.fn() }));
vi.mock('../../remote/update-dos-donts-entry', () => ({ updateDosDontsEntry: vi.fn() }));
vi.mock('../../remote/delete-dos-donts-entry', () => ({ deleteDosDontsEntry: vi.fn() }));

import { fetchDosAndDonts } from '../../remote/fetch-dos-and-donts';
import { createDosDontsEntry } from '../../remote/create-dos-donts-entry';
import { updateDosDontsEntry } from '../../remote/update-dos-donts-entry';
import { deleteDosDontsEntry } from '../../remote/delete-dos-donts-entry';
import { useDosAndDontsRepository } from '../use-dos-and-donts-repository';
import type { DosDontsEntryDataModel } from '../../model/dos-donts-entry-data-model';

const fetchMock = vi.mocked(fetchDosAndDonts);
const createMock = vi.mocked(createDosDontsEntry);
const updateMock = vi.mocked(updateDosDontsEntry);
const deleteMock = vi.mocked(deleteDosDontsEntry);

function dto(over: Partial<DosDontsEntryDataModel> = {}): DosDontsEntryDataModel {
  return {
    id: 'dd1',
    brandId: 'b1',
    type: 'do',
    category: 'tone',
    ruleText: 'rule',
    exampleText: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...over,
  };
}

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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

describe('useDosAndDontsRepository', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and maps entries', async () => {
    fetchMock.mockResolvedValue([dto()]);
    const client = createTestClient();
    const { result } = renderHook(() => useDosAndDontsRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.listQuery.data).toHaveLength(1));
    expect(result.current.listQuery.data?.[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('forwards filters into the fetch call', async () => {
    fetchMock.mockResolvedValue([]);
    const client = createTestClient();
    renderHook(() => useDosAndDontsRepository({ brandId: 'b1', type: 'dont' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith({ brandId: 'b1', type: 'dont' }),
    );
  });

  it('invalidates the brand-scoped cache after create', async () => {
    fetchMock.mockResolvedValue([]);
    createMock.mockResolvedValue(dto({ id: 'dd2' }));
    const client = createTestClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDosAndDontsRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.listQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.createMutation.mutateAsync({
        type: 'do',
        category: 'tone',
        ruleText: 'r',
      });
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['brand-guidelines', 'dos-and-donts', 'b1', null, null],
    });
  });

  it('invalidates the cache after update', async () => {
    fetchMock.mockResolvedValue([]);
    updateMock.mockResolvedValue(dto({ ruleText: 'new' }));
    const client = createTestClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDosAndDontsRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.listQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.updateMutation.mutateAsync({ entryId: 'dd1', ruleText: 'new' });
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it('invalidates the cache after delete', async () => {
    fetchMock.mockResolvedValue([]);
    deleteMock.mockResolvedValue();
    const client = createTestClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDosAndDontsRepository({ brandId: 'b1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => expect(result.current.listQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.deleteMutation.mutateAsync({ entryId: 'dd1' });
    });
    expect(invalidate).toHaveBeenCalled();
  });
});
