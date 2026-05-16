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
vi.mock('@/features/brand-voice', () => ({
  VoiceEditPage: ({ brandId }: { brandId: string }): ReactElement => (
    <div data-testid="voice-edit-page">{brandId}</div>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import Page from '../page';

describe('voice-edit route wrapper', () => {
  it('awaits params and renders VoiceEditPage with the brandId', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = Promise.resolve({ id: 'brand-1' });
    const ui = (await Page({ params })) as ReactElement;
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
    await waitFor(() =>
      expect(screen.getByTestId('voice-edit-page')).toHaveTextContent('brand-1'),
    );
  });
});
