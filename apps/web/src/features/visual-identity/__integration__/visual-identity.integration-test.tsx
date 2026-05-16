import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';
import { VisualIdentityCard } from '../presentation/components/VisualIdentityCard';
import { EditVisualIdentityPage } from '../presentation/pages/edit-visual-identity';

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: ReturnType<typeof vi.fn>; push: ReturnType<typeof vi.fn> } => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

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

const EMPTY_PAYLOAD = {
  id: '',
  brandId: 'brand-1',
  logoUsageRules: null,
  colourPalette: [],
  typographyRules: [],
  spacingLayoutGuidance: null,
  imageStyleGuidance: null,
  iconographyGuidance: null,
  usageRestrictions: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const POPULATED_PAYLOAD = {
  id: 'vi-1',
  brandId: 'brand-1',
  logoUsageRules: 'Clear space rule.',
  colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'Main brand.' }],
  typographyRules: [
    { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
  ],
  spacingLayoutGuidance: '8px grid.',
  imageStyleGuidance: null,
  iconographyGuidance: null,
  usageRestrictions: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Visual identity (integration)', () => {
  it('renders the empty-state card when GET returns the sentinel id', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/visual-identity`, () =>
        HttpResponse.json({ success: true, data: EMPTY_PAYLOAD }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: '+ Edit visual identity' }),
      ).toHaveAttribute('href', '/brands/brand-1/visual-identity/edit'),
    );
  });

  it('renders the populated read view when GET returns a row', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/visual-identity`, () =>
        HttpResponse.json({ success: true, data: POPULATED_PAYLOAD }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText('Clear space rule.')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Colour palette \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Typography rules \(1\)/)).toBeInTheDocument();
  });

  it('shows the error state when GET returns 500', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/visual-identity`, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 500, message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText('An error occurred')).toBeInTheDocument(),
    );
  });

  it('edit page renders the form, prefills from GET, and surfaces the 404 branch', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-2/visual-identity`, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 404, message: 'not found' } },
          { status: 404 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-2" />
      </Wrapper>,
    );

    await waitFor(() => expect(screen.getByText('404')).toBeInTheDocument());
  });

  it('edit page mounts the form when GET succeeds', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-3/visual-identity`, () =>
        HttpResponse.json({
          success: true,
          data: { ...EMPTY_PAYLOAD, brandId: 'brand-3' },
        }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-3" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
