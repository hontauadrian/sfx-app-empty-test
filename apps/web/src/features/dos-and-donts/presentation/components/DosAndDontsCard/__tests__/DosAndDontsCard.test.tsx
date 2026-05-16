import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/features/presentation/localization';

const fetchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/features/dos-and-donts/data/remote/fetch-dos-and-donts', () => ({
  fetchDosAndDonts: (input: unknown): unknown => fetchMock(input),
}));

vi.mock('@/features/dos-and-donts/data/remote/delete-dos-and-dont', () => ({
  deleteDosAndDont: (input: unknown): unknown => deleteMock(input),
}));

import { DosAndDontsCard } from '..';

function withClient(ui: ReactNode): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('DosAndDontsCard', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    deleteMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the empty-state CTA when the list is empty', async () => {
    fetchMock.mockResolvedValueOnce([]);
    render(withClient(<DosAndDontsCard brandId="b-1" />));
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: "+ Add do/don't" }),
      ).toHaveAttribute('href', '/brands/b-1/dos-and-donts/new'),
    );
    expect(screen.getByRole('heading', { name: "Dos & Don'ts" })).toBeInTheDocument();
  });

  it('renders grouped entries with per-row Edit and Delete affordances', async () => {
    fetchMock.mockResolvedValueOnce([
      {
        id: 'e-1',
        brandId: 'b-1',
        type: 'do',
        category: 'tone',
        title: 'Use active voice',
        body: 'Prefer active.',
        suggestedCorrection: null,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ]);
    render(withClient(<DosAndDontsCard brandId="b-1" />));
    await waitFor(() =>
      expect(screen.getByText('Use active voice')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/brands/b-1/dos-and-donts/e-1/edit',
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('opens the delete confirm modal and calls the delete remote on confirm', async () => {
    fetchMock.mockResolvedValueOnce([
      {
        id: 'e-1',
        brandId: 'b-1',
        type: 'do',
        category: 'tone',
        title: 'Use active voice',
        body: 'Prefer active.',
        suggestedCorrection: null,
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ]);
    deleteMock.mockResolvedValueOnce(undefined);
    render(withClient(<DosAndDontsCard brandId="b-1" />));
    await waitFor(() =>
      expect(screen.getByText('Use active voice')).toBeInTheDocument(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(
      screen.getByRole('dialog', { name: "Delete do/don't" }),
    ).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(confirmButtons[confirmButtons.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith({ brandId: 'b-1', entryId: 'e-1' }),
    );
  });
});
