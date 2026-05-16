import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/auth', () => ({
  AuthGate: ({ children }: { children: ReactNode }): ReactElement => <>{children}</>,
}));
vi.mock('@/features/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }): ReactElement => <>{children}</>,
}));
vi.mock('@/features/dos-and-donts', () => ({
  EditDosAndDontPage: ({
    brandId,
    entryId,
  }: {
    brandId: string;
    entryId: string;
  }): ReactElement => (
    <div data-testid="edit-dos-and-dont-page">{`${brandId}:${entryId}`}</div>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import Page from '../page';

describe('dos-and-donts edit route wrapper', () => {
  it('awaits params and renders EditDosAndDontPage with brand + entry ids', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = Promise.resolve({ id: 'brand-1', entryId: 'entry-1' });
    const ui = (await Page({ params })) as ReactElement;
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('edit-dos-and-dont-page')).toHaveTextContent(
        'brand-1:entry-1',
      ),
    );
  });
});
