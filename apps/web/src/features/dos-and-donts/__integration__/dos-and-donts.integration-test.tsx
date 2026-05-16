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
import { DosAndDontsCard } from '../presentation/components/DosAndDontsCard';
import { EditDosAndDontPage } from '../presentation/pages/edit-dos-and-dont';

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

const TONE_ENTRY = {
  id: 'entry-1',
  brandId: 'brand-1',
  type: 'do',
  category: 'tone',
  title: 'Use active voice',
  body: 'Prefer active over passive.',
  suggestedCorrection: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const VISUALS_ENTRY = {
  id: 'entry-2',
  brandId: 'brand-1',
  type: 'dont',
  category: 'visuals',
  title: 'No recoloured logos',
  body: 'Never tint or gradient the primary mark.',
  suggestedCorrection: 'Use the monochrome variant.',
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Dos and donts (integration)', () => {
  it('renders the empty-state card with the Add CTA when LIST returns []', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <DosAndDontsCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: "+ Add do/don't" })).toHaveAttribute(
        'href',
        '/brands/brand-1/dos-and-donts/new',
      ),
    );
  });

  it('renders grouped entries (category then type) when LIST returns rows', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json({ success: true, data: [TONE_ENTRY, VISUALS_ENTRY] }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <DosAndDontsCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText('Use active voice')).toBeInTheDocument(),
    );
    expect(screen.getByText('No recoloured logos')).toBeInTheDocument();
    expect(screen.getByText('Tone')).toBeInTheDocument();
    expect(screen.getByText('Visuals')).toBeInTheDocument();
    const editLinks = screen.getAllByRole('link', { name: 'Edit' });
    expect(editLinks).toHaveLength(2);
    expect(editLinks[0]).toHaveAttribute(
      'href',
      '/brands/brand-1/dos-and-donts/entry-1/edit',
    );
    expect(editLinks[1]).toHaveAttribute(
      'href',
      '/brands/brand-1/dos-and-donts/entry-2/edit',
    );
  });

  it('shows an error state when LIST returns 500', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json(
          { success: false, error: { statusCode: 500, message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <DosAndDontsCard brandId="brand-1" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText('An error occurred')).toBeInTheDocument(),
    );
  });

  it('edit page surfaces the not-found branch when GET-one returns 404', async () => {
    server.use(
      http.get(
        `${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts/missing`,
        () =>
          HttpResponse.json(
            { success: false, error: { statusCode: 404, message: 'not found' } },
            { status: 404 },
          ),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <EditDosAndDontPage brandId="brand-1" entryId="missing" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText('Entry not found')).toBeInTheDocument(),
    );
  });

  it('edit page mounts the prefilled form when GET-one returns the entry', async () => {
    server.use(
      http.get(
        `${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts/entry-2`,
        () => HttpResponse.json({ success: true, data: VISUALS_ENTRY }),
      ),
    );

    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <EditDosAndDontPage brandId="brand-1" entryId="entry-2" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue('No recoloured logos')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
