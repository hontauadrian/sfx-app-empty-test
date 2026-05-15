import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { DashboardPage } from '../presentation/pages/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

const initialStore = useActiveBrandStore.getState();

const apiBaseUrl = 'http://localhost:3001';

const server = setupServer();

function createWrapper(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useActiveBrandStore.setState({ activeBrandId: null });
});

describe('Brands dashboard (integration)', () => {
  it('renders the empty state when GET /api/v1/brands returns no brands', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No brands yet' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '+ Create brand' })).toHaveAttribute(
      'href',
      '/brands/new',
    );
  });

  it('surfaces the error state when GET /api/v1/brands returns 500', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 500, message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <DashboardPage />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('An error occurred')).toBeInTheDocument();
    });
  });

  afterAll(() => {
    useActiveBrandStore.setState(initialStore, true);
  });
});
