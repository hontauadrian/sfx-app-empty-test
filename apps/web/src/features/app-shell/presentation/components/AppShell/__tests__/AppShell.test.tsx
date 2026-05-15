import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

const pushSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: (): { push: Mock } => ({ push: pushSpy }),
  usePathname: (): string => '/brands/brand-1',
}));

vi.mock('@/features/brand-profile/data/remote/fetch-brands', () => ({
  fetchBrands: vi.fn(),
}));

vi.mock('@/features/auth', () => ({
  useAuthSessionRepository: vi.fn(),
}));

import { fetchBrands } from '@/features/brand-profile/data/remote/fetch-brands';
import { useAuthSessionRepository } from '@/features/auth';
import { LanguageProvider } from '@/features/presentation/localization';
import { useActiveBrandStore } from '@/stores/active-brand-store';
import { AppShell } from '..';

const initialStore = useActiveBrandStore.getState();

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

describe('AppShell', () => {
  beforeEach(() => {
    pushSpy.mockReset();
    (fetchBrands as unknown as Mock).mockReset();
    (fetchBrands as unknown as Mock).mockResolvedValue([
      {
        id: 'brand-1',
        ownerSubject: 'sub-1',
        name: 'Acme',
        description: null,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
      },
      {
        id: 'brand-2',
        ownerSubject: 'sub-1',
        name: 'Beta',
        description: null,
        createdAt: '2026-05-15T10:00:00.000Z',
        updatedAt: '2026-05-15T10:00:00.000Z',
      },
    ]);
    (useAuthSessionRepository as unknown as Mock).mockReturnValue({
      data: { email: 'user@example.com' },
      isLoading: false,
    });
    useActiveBrandStore.setState({ activeBrandId: 'brand-1' });
  });

  afterEach(() => {
    useActiveBrandStore.setState(initialStore, true);
  });

  it('renders the brand mark and child content', () => {
    render(
      <AppShell>
        <p>child content</p>
      </AppShell>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByRole('link', { name: 'Brand Guidelines' })).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('navigates to the new-brand route when create-brand is chosen from the selector', async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <p>child</p>
      </AppShell>,
      { wrapper: createWrapper() },
    );

    await user.click(await screen.findByRole('button', { name: 'Select brand' }));
    await user.click(screen.getByRole('button', { name: '+ Create brand' }));
    expect(pushSpy).toHaveBeenCalledWith('/brands/new');
  });
});
