import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
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

import { useTranslations } from '@/features/presentation/localization';
import { common as enCommon } from '@/features/presentation/localization/languages/en/common';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';
import { useCompanyInfoHistory } from '@/features/company-info/presentation/pages/company-info-history/use-company-info-history';
import { useCompanyInfoHistoryDetail } from '@/features/company-info/presentation/pages/company-info-history-detail/use-company-info-history-detail';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const COMPANY_INFO_VERSIONS_URL = `${API_BASE_URL}/api/v1/company-info/versions`;
const COMPANY_INFO_VERSION_URL = `${API_BASE_URL}/api/v1/company-info/versions/v-1`;

function snapshotDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cid-1',
    legalName: 'Acme Holdings SRL',
    tradingName: 'Acme',
    email: 'contact@acme.test',
    phone: null,
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: 'Bucharest',
    postalCode: null,
    country: 'Romania',
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

function versionDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'v-1',
    companyInfoId: 'cid-1',
    snapshot: snapshotDto(),
    editorUserId: 'user-1',
    editorDisplayName: 'Ada Lovelace',
    createdAt: '2024-06-02T10:00:00.000Z',
    ...overrides,
  };
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.mocked(useTranslations).mockReturnValue(enCommon);
});

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <LanguageProvider defaultLanguage="en">
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </LanguageProvider>
    );
  };
}

describe('company-info-history feature (integration: hook → repository → MSW → state)', () => {
  it('list happy: GET /versions returns 2 items + nextCursor:null → status=ready', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSIONS_URL, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [versionDto({ id: 'v-1' }), versionDto({ id: 'v-2', editorDisplayName: 'Grace Hopper' })],
            nextCursor: null,
          },
        }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    expect(result.current.uiModel.rows).toHaveLength(2);
    expect(result.current.uiModel.rows[0]?.id).toBe('v-1');
    expect(result.current.uiModel.rows[0]?.editorLabel).toBe('Ada Lovelace');
    expect(result.current.uiModel.rows[1]?.editorLabel).toBe('Grace Hopper');
    expect(result.current.uiModel.rows[0]?.href).toBe('/admin/company-info/history/v-1');
  });

  it('list empty: GET /versions returns empty items → status=empty', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSIONS_URL, () =>
        HttpResponse.json({ success: true, data: { items: [], nextCursor: null } }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('empty');
    });
  });

  it('list denied: 403 → status=denied', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSIONS_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 403, message: 'Forbidden' } },
          { status: 403 },
        ),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistory(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('denied');
    });
  });

  it('detail happy: GET /versions/v-1 returns version → banner data + sections wired in', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSION_URL, () =>
        HttpResponse.json({
          success: true,
          data: versionDto({
            editorDisplayName: 'Grace Hopper',
            snapshot: snapshotDto({ legalName: 'Detail Co SRL', foundedYear: 1998 }),
          }),
        }),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    expect(result.current.uiModel.banner.message).toContain('Grace Hopper');
    const legal = result.current.uiModel.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === 'legalName');
    expect(legal?.value).toMatchObject({ kind: 'scalar', text: 'Detail Co SRL' });
    const foundedYear = result.current.uiModel.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === 'foundedYear');
    expect(foundedYear?.value).toMatchObject({ kind: 'scalar', text: '1998' });
  });

  it('detail not-found: 404 → status=not-found', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSION_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 404, message: 'Version not found' } },
          { status: 404 },
        ),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('not-found');
    });
  });

  it('detail denied: 403 → status=denied', async () => {
    server.use(
      http.get(COMPANY_INFO_VERSION_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 403, message: 'Forbidden' } },
          { status: 403 },
        ),
      ),
    );
    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoHistoryDetail({ versionId: 'v-1' }), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('denied');
    });
  });
});
