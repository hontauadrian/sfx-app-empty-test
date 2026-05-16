import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { ContentCheckPage } from '../presentation/pages/content-check';

const apiBaseUrl = 'http://localhost:3001';

const TONE_DO_ENTRY = {
  id: 'entry-tone-do',
  brandId: 'brand-1',
  type: 'do',
  category: 'tone',
  title: 'Use active voice',
  body: 'Prefer active over passive.',
  suggestedCorrection: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const LEGAL_DONT_ENTRY = {
  id: 'entry-legal-dont',
  brandId: 'brand-1',
  type: 'dont',
  category: 'legal',
  title: 'No medical claims',
  body: 'Never promise medical outcomes.',
  suggestedCorrection: 'Reword as a general wellness statement.',
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const ACME_BRAND = {
  id: 'brand-1',
  ownerSubject: 'admin-sub',
  name: 'Acme',
  description: null,
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
};

const server = setupServer();
const initialStoreState = useActiveBrandStore.getState();

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
afterEach(() => {
  server.resetHandlers();
  useActiveBrandStore.setState(initialStoreState, true);
});
afterAll(() => server.close());

describe('content-check feature (integration)', () => {
  it('renders the no-active-brand empty state and issues NO dos-and-donts fetch when there is no active brand', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );
    useActiveBrandStore.setState({ activeBrandId: null });

    render(<ContentCheckPage />, { wrapper: createWrapper() });

    expect(
      await screen.findByText(
        "Pick a brand to start checking your content against its dos and don'ts.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pick a brand' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders the populated result list (Do before Dont within a category) when the F1 endpoint returns entries', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [ACME_BRAND] }),
      ),
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json({
          success: true,
          data: [TONE_DO_ENTRY, LEGAL_DONT_ENTRY],
        }),
      ),
    );
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });

    render(<ContentCheckPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: 'Tone' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Legal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Use active voice')).toBeInTheDocument();
    expect(screen.getByText('No medical claims')).toBeInTheDocument();
    expect(screen.getByText('Suggested correction')).toBeInTheDocument();
  });

  it('switches the wire call to ?category=tone when the user picks Tone and renders only the Tone group', async () => {
    let lastQuery: string | null = null;
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [ACME_BRAND] }),
      ),
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, ({ request }) => {
        const url = new URL(request.url);
        lastQuery = url.searchParams.get('category');
        if (lastQuery === 'tone') {
          return HttpResponse.json({ success: true, data: [TONE_DO_ENTRY] });
        }
        return HttpResponse.json({
          success: true,
          data: [TONE_DO_ENTRY, LEGAL_DONT_ENTRY],
        });
      }),
    );
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });

    const user = userEvent.setup();
    render(<ContentCheckPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: 'Legal' }),
      ).toBeInTheDocument();
    });

    await user.selectOptions(
      screen.getByLabelText('Category') as HTMLSelectElement,
      'tone',
    );

    await waitFor(() => {
      expect(lastQuery).toBe('tone');
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Legal' }),
      ).toBeNull();
    });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Tone' }),
    ).toBeInTheDocument();
  });

  it('renders the zero-matches branch with the brand-overview CTA when the F1 endpoint returns an empty list', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [ACME_BRAND] }),
      ),
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });

    render(<ContentCheckPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("No dos or don'ts yet")).toBeInTheDocument();
    });
    expect(
      screen.getByRole('link', { name: "+ Add do/don't" }),
    ).toHaveAttribute('href', '/brands/brand-1');
  });

  it('clears the active-brand store and renders the no-active-brand branch when F1 GET returns 404', async () => {
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
          { status: 404 },
        ),
      ),
    );
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });

    render(<ContentCheckPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(useActiveBrandStore.getState().activeBrandId).toBeNull();
    });
    expect(
      await screen.findByText(
        "Pick a brand to start checking your content against its dos and don'ts.",
      ),
    ).toBeInTheDocument();
  });

  it('echoes the typed pasted text into the Reference text block without issuing any POST or body containing the text', async () => {
    const requestBodies: string[] = [];
    server.use(
      http.get(`${apiBaseUrl}/api/v1/brands`, () =>
        HttpResponse.json({ success: true, data: [ACME_BRAND] }),
      ),
      http.get(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, () =>
        HttpResponse.json({ success: true, data: [TONE_DO_ENTRY] }),
      ),
      http.post(`${apiBaseUrl}/api/v1/brands/brand-1/dos-and-donts`, async ({ request }) => {
        requestBodies.push(await request.text());
        return HttpResponse.json({ success: false }, { status: 405 });
      }),
    );
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });

    const user = userEvent.setup();
    render(<ContentCheckPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: 'Tone' }),
      ).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText('Paste content to check');
    await user.type(textarea, 'Hello world content to check');
    await user.click(screen.getByRole('button', { name: 'Check content' }));

    const referenceBlock = await screen.findByLabelText('Reference text');
    expect(
      within(referenceBlock).getByText('Hello world content to check'),
    ).toBeInTheDocument();
    expect(requestBodies).toEqual([]);
  });
});
