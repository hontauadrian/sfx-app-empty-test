import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';

vi.mock('@/features/presentation/localization', () => ({
  useTranslations: vi.fn(),
}));

vi.mock('@/features/presentation/toast', () => ({
  useToast: vi.fn(),
}));

import { useTranslations } from '@/features/presentation/localization';
import { useToast } from '@/features/presentation/toast';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { useBrandsRepository } from '@/features/brand-shell/data/repositories/use-brands-repository';
import { BRANDS_QUERY_KEY } from '@/features/brand-shell/constants';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BRANDS_URL = `${API_BASE_URL}/api/v1/brands`;

interface BrandDto {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function dto(over: Partial<BrandDto> = {}): BrandDto {
  return {
    id: 'clxbrand0001',
    name: 'Acme',
    slug: 'acme',
    ownerUserId: 'subject-admin',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

const server = setupServer();

const pushSuccess = vi.fn();
const pushError = vi.fn();
const dismiss = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  pushSuccess.mockReset();
  pushError.mockReset();
  dismiss.mockReset();
});
afterAll(() => server.close());

beforeEach(() => {
  vi.mocked(useTranslations).mockReturnValue(enCommon);
  vi.mocked(useToast).mockReturnValue({ success: pushSuccess, error: pushError, dismiss });
});

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('brand-shell integration: useBrandsRepository → MSW → mapper → state', () => {
  it('fetches active brands, maps ISO dates to Date instances', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({
          success: true,
          data: { brands: [dto(), dto({ id: 'clxbrand0002', name: 'Beta', slug: 'beta' })] },
        }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    expect(result.current.brandsQuery.data).toHaveLength(2);
    expect(result.current.brandsQuery.data?.[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.current.brandsQuery.data?.[1]?.slug).toBe('beta');
  });

  it('surfaces an empty list cleanly when the API returns no brands', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({ success: true, data: { brands: [] } }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    expect(result.current.brandsQuery.data).toEqual([]);
  });

  it('exposes an error state on a 500 from the API', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 500, message: 'Internal server error' } },
          { status: 500 },
        ),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isError).toBe(true));
  });

  it('createMutation POSTs to the API and prepends the new brand to the cached list', async () => {
    let observedBody: Record<string, unknown> | null = null;
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({
          success: true,
          data: { brands: [dto({ id: 'clxbrand0099', name: 'Existing', slug: 'existing' })] },
        }),
      ),
      http.post(BRANDS_URL, async ({ request }) => {
        observedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            success: true,
            data: dto({ id: 'clxbrand0100', name: 'Created', slug: 'created' }),
          },
          { status: 201 },
        );
      }),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.createMutation.mutateAsync({ name: 'Created' });
    });
    expect(observedBody).toEqual({ name: 'Created' });
    const cache = client.getQueryData<readonly { id: string }[]>(BRANDS_QUERY_KEY);
    expect(cache?.[0]?.id).toBe('clxbrand0100');
  });

  it('renameMutation PATCHes the API and updates the cached brand in-place', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({
          success: true,
          data: { brands: [dto({ id: 'clxbrand0001', name: 'Old', slug: 'old' })] },
        }),
      ),
      http.patch(`${BRANDS_URL}/clxbrand0001`, async () =>
        HttpResponse.json({
          success: true,
          data: dto({ id: 'clxbrand0001', name: 'Renamed', slug: 'renamed' }),
        }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.renameMutation.mutateAsync({ id: 'clxbrand0001', name: 'Renamed' });
    });
    const cache = client.getQueryData<readonly { id: string; name: string }[]>(BRANDS_QUERY_KEY);
    expect(cache?.[0]?.name).toBe('Renamed');
  });

  it('deleteMutation DELETEs via the API and removes the brand from the cache', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({
          success: true,
          data: {
            brands: [
              dto({ id: 'clxbrand0001', name: 'GoneSoon' }),
              dto({ id: 'clxbrand0002', name: 'Survivor' }),
            ],
          },
        }),
      ),
      http.delete(`${BRANDS_URL}/clxbrand0001`, () => new HttpResponse(null, { status: 204 })),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    await act(async () => {
      await result.current.deleteMutation.mutateAsync({ id: 'clxbrand0001' });
    });
    const cache = client.getQueryData<readonly { id: string }[]>(BRANDS_QUERY_KEY);
    expect(cache?.map((entry) => entry.id)).toEqual(['clxbrand0002']);
  });

  it('createMutation surfaces an error envelope from the API as a mutation error', async () => {
    server.use(
      http.get(BRANDS_URL, () =>
        HttpResponse.json({ success: true, data: { brands: [] } }),
      ),
      http.post(BRANDS_URL, () =>
        HttpResponse.json(
          {
            success: false,
            error: { statusCode: 400, message: 'Validation failed' },
          },
          { status: 400 },
        ),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useBrandsRepository(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.brandsQuery.isSuccess).toBe(true));
    await act(async () => {
      try {
        await result.current.createMutation.mutateAsync({ name: '' });
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.createMutation.isError).toBe(true));
  });
});
