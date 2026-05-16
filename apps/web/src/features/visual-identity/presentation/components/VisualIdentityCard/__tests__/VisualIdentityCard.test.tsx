import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));

import { fetchVisualIdentity } from '../../../../data/remote/fetch-visual-identity';
import { LanguageProvider } from '@/features/presentation/localization';
import { VisualIdentityCard } from '../index';

function withClient(): (args: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>
        <LanguageProvider>{children}</LanguageProvider>
      </QueryClientProvider>
    );
  };
}

const EMPTY = {
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

const POPULATED = {
  id: 'vi-1',
  brandId: 'brand-1',
  logoUsageRules: 'Clear space.',
  colourPalette: [{ name: 'Primary', hex: 'xxx', usage: 'Main.' }],
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

describe('VisualIdentityCard', () => {
  beforeEach(() => {
    (fetchVisualIdentity as unknown as Mock).mockReset();
  });

  it('renders the loading skeleton initially', () => {
    (fetchVisualIdentity as unknown as Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );
    expect(screen.getByRole('region', { busy: true })).toBeInTheDocument();
  });

  it('renders the empty-state card when the envelope id is the sentinel', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getAllByText('+ Edit visual identity').length).toBeGreaterThan(0),
    );
    const cta = screen.getByRole('link', { name: '+ Edit visual identity' });
    expect(cta).toHaveAttribute('href', '/brands/brand-1/visual-identity/edit');
  });

  it('renders the populated read view when a row exists', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(POPULATED);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Clear space.')).toBeInTheDocument());
    expect(screen.getByText(/Colour palette \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Typography rules \(1\)/)).toBeInTheDocument();
  });

  it('shows the error message on non-404 error', async () => {
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument(),
    );
  });

  it('falls back to the empty-state when fetch returns 404 (defensive)', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(error);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VisualIdentityCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getAllByText('+ Edit visual identity').length).toBeGreaterThan(0),
    );
  });
});
