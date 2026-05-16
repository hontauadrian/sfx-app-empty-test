import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/features/presentation/localization';

const pushMock = vi.fn();
const createMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: typeof pushMock } => ({ push: pushMock }),
}));

vi.mock('@/features/dos-and-donts/data/remote/create-dos-and-dont', () => ({
  createDosAndDont: (input: unknown): unknown => createMock(input),
}));

import { NewDosAndDontPage } from '..';

function withClient(ui: ReactNode): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('NewDosAndDontPage', () => {
  it('submits a valid payload then navigates back to the brand route', async () => {
    pushMock.mockClear();
    createMock.mockResolvedValueOnce({
      id: 'e-1',
      brandId: 'b-1',
      type: 'do',
      category: 'tone',
      title: 'Use active voice',
      body: 'Prefer active.',
      suggestedCorrection: null,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    render(withClient(<NewDosAndDontPage brandId="b-1" />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Title'), 'Use active voice');
    await user.type(screen.getByLabelText('Body'), 'Prefer active.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/brands/b-1'));
  });

  it('does not call create when the title is empty', async () => {
    createMock.mockClear();
    render(withClient(<NewDosAndDontPage brandId="b-1" />));
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Body'), 'body present');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(createMock).not.toHaveBeenCalled();
    });
  });
});
