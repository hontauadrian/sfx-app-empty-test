import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/features/presentation/localization';

const pushMock = vi.fn();
const fetchByIdMock = vi.fn();
const updateMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: typeof pushMock } => ({ push: pushMock }),
}));
vi.mock('@/features/dos-and-donts/data/remote/fetch-dos-and-dont-by-id', () => ({
  fetchDosAndDontById: (input: unknown): unknown => fetchByIdMock(input),
}));
vi.mock('@/features/dos-and-donts/data/remote/update-dos-and-dont', () => ({
  updateDosAndDont: (input: unknown): unknown => updateMock(input),
}));

import { EditDosAndDontPage } from '..';

function withClient(ui: ReactNode): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('EditDosAndDontPage', () => {
  it('pre-populates the form from the by-id query and navigates back after a successful save', async () => {
    pushMock.mockClear();
    fetchByIdMock.mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 'Original',
      body: 'body',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    updateMock.mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 'Updated',
      body: 'body',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T01:00:00.000Z',
    });
    render(withClient(<EditDosAndDontPage brandId="b-1" entryId="e-1" />));
    await waitFor(() =>
      expect(screen.getByLabelText('Title')).toHaveValue('Original'),
    );
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/brands/b-1'));
  });

  it('renders the not-found branch when the by-id query rejects with status 404', async () => {
    const error: Error & { status?: number } = new Error('404');
    error.status = 404;
    fetchByIdMock.mockRejectedValueOnce(error);
    render(withClient(<EditDosAndDontPage brandId="b-1" entryId="missing" />));
    await waitFor(() =>
      expect(screen.getByText('Entry not found')).toBeInTheDocument(),
    );
  });
});
