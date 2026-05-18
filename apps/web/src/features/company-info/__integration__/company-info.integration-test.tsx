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
import { useCompanyInfoRepository } from '@/features/company-info/data/repositories/use-company-info-repository';
import { useCompanyInfo } from '@/features/company-info/presentation/pages/company-info/use-company-info';
import { COMPANY_INFO_QUERY_KEY } from '@/features/company-info/constants';
import { AUTH_SESSION_QUERY_KEY } from '@/features/auth/constants';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const COMPANY_INFO_URL = `${API_BASE_URL}/api/v1/company-info`;

function dto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function createWrapper(client: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('company-info feature (integration: hook → repository → MSW → state)', () => {
  it('fetches the singleton company info via GET and maps it into the page hook state', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: dto() })),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    await waitFor(() => {
      expect(result.current.form.getValues('legalName')).toBe('Acme Holdings SRL');
    });
    expect(result.current.form.getValues('email')).toBe('contact@acme.test');
    expect(result.current.uiModel.submit.label).toBe(enCommon.adminCompanyInfo.cta.save);
  });

  it('renders the empty/create state when GET returns null', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });
    expect(result.current.uiModel.submit.label).toBe(enCommon.adminCompanyInfo.cta.create);
    expect(result.current.form.getValues('legalName')).toBe('');
  });

  it('routes a 403 GET into the denied surface', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 403, message: 'Forbidden' } },
          { status: 403 },
        ),
      ),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('denied');
    });
  });

  it('roundtrips: GET null → submit valid → PUT echoes the persisted record → cache holds mapped CompanyInfo', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
      http.put(COMPANY_INFO_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          data: dto({
            legalName: body.legalName,
            tradingName: body.tradingName,
            email: body.email,
            updatedAt: '2024-06-03T12:00:00.000Z',
          }),
        });
      }),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });

    act(() => {
      result.current.form.setValue('legalName', 'Roundtrip Co SRL');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushSuccess).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.success);

    await waitFor(() => {
      const cached = client.getQueryData(COMPANY_INFO_QUERY_KEY) as { legalName?: string } | undefined;
      expect(cached?.legalName).toBe('Roundtrip Co SRL');
    });
    expect(result.current.form.getValues('legalName')).toBe('Roundtrip Co SRL');
  });

  it('surfaces nested 400 envelope errors as per-field form errors without a toast', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
      http.put(COMPANY_INFO_URL, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              statusCode: 400,
              message: 'Validation failed',
              errors: [
                { field: 'legalName', message: 'Legal name is required' },
                { field: 'email', message: 'Invalid email address' },
              ],
            },
          },
          { status: 400 },
        ),
      ),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });

    act(() => {
      result.current.form.setValue('legalName', 'Bypass client');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushSuccess).not.toHaveBeenCalled();
    expect(pushError).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.form.getFieldState('legalName').error?.message).toBe('Legal name is required');
    });
    expect(result.current.form.getFieldState('email').error?.message).toBe('Invalid email address');
  });

  it('routes a 401 PUT into the auth toast and invalidates the auth session query', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
      http.put(COMPANY_INFO_URL, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 401, message: 'Unauthorized' } },
          { status: 401 },
        ),
      ),
    );

    const client = createClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });

    act(() => {
      result.current.form.setValue('legalName', 'Will fail');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushError).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.authError);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: AUTH_SESSION_QUERY_KEY });
  });

  it('routes a 500 PUT into the unexpected-error toast', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
      http.put(COMPANY_INFO_URL, () => new HttpResponse(null, { status: 500 })),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });

    act(() => {
      result.current.form.setValue('legalName', 'Will crash');
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushError).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.unexpectedError);
    expect(pushSuccess).not.toHaveBeenCalled();
  });

  it('roundtrips expanded payload: PUT with arrays + foundedYear → echoes back and form reflects values', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: null })),
      http.put(COMPANY_INFO_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        capturedBody = body;
        return HttpResponse.json({
          success: true,
          data: dto({
            legalName: body.legalName,
            foundedYear: body.foundedYear,
            missionStatement: body.missionStatement,
            coreValues: body.coreValues,
            updatedAt: '2024-06-04T12:00:00.000Z',
          }),
        });
      }),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfo(), { wrapper: createWrapper(client) });

    await waitFor(() => {
      expect(result.current.uiModel.status).toBe('ready');
    });

    act(() => {
      result.current.form.setValue('legalName', 'Expanded Co SRL');
      result.current.form.setValue('foundedYear', 1998);
      result.current.form.setValue('missionStatement', 'Build great things');
      result.current.form.setValue('coreValues', ['Integrity', 'Craft']);
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(pushSuccess).toHaveBeenCalledWith(enCommon.adminCompanyInfo.toast.success);
    expect(capturedBody?.coreValues).toEqual(['Integrity', 'Craft']);
    expect(capturedBody?.foundedYear).toBe(1998);
    expect(capturedBody?.missionStatement).toBe('Build great things');

    await waitFor(() => {
      expect(result.current.form.getValues('foundedYear')).toBe(1998);
    });
    expect(result.current.form.getValues('coreValues')).toEqual(['Integrity', 'Craft']);
    expect(result.current.form.getValues('missionStatement')).toBe('Build great things');
  });

  it('useCompanyInfoRepository: GET → 200 envelope → companyInfoQuery.data deep-equals mapped CompanyInfo', async () => {
    server.use(
      http.get(COMPANY_INFO_URL, () => HttpResponse.json({ success: true, data: dto() })),
    );

    const client = createClient();
    const { result } = renderHook(() => useCompanyInfoRepository(), { wrapper: createWrapper(client) });
    await waitFor(() => {
      expect(result.current.companyInfoQuery.isSuccess).toBe(true);
    });
    expect(result.current.companyInfoQuery.data?.legalName).toBe('Acme Holdings SRL');
    expect(result.current.companyInfoQuery.data?.createdAt).toBeInstanceOf(Date);
    expect(result.current.companyInfoQuery.data?.updatedAt).toBeInstanceOf(Date);
  });
});
