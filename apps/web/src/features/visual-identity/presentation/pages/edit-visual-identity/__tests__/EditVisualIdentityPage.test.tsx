import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-visual-identity', () => ({
  fetchVisualIdentity: vi.fn(),
}));
vi.mock('../../../../data/remote/upsert-visual-identity', () => ({
  upsertVisualIdentity: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { fetchVisualIdentity } from '../../../../data/remote/fetch-visual-identity';
import { upsertVisualIdentity } from '../../../../data/remote/upsert-visual-identity';
import { useRouter } from 'next/navigation';
import { LanguageProvider } from '@/features/presentation/localization';
import { EditVisualIdentityPage } from '../index';

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

describe('EditVisualIdentityPage', () => {
  let push: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    push = vi.fn();
    (useRouter as unknown as Mock).mockReturnValue({ push });
    (fetchVisualIdentity as unknown as Mock).mockReset();
    (upsertVisualIdentity as unknown as Mock).mockReset();
  });

  it('renders the loading skeleton initially', () => {
    (fetchVisualIdentity as unknown as Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    const section = document.querySelector('section[aria-busy="true"]');
    expect(section).not.toBeNull();
  });

  it('renders the form once the visual-identity loads', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(),
    );
  });

  it('navigates back to the brand overview after a successful save', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY);
    (upsertVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/brands/brand-1'));
  });

  it('navigates back on cancel without firing the upsert', async () => {
    (fetchVisualIdentity as unknown as Mock).mockResolvedValueOnce(EMPTY);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/brands/brand-1'));
    expect(upsertVisualIdentity).not.toHaveBeenCalled();
  });

  it('renders the notFound branch when the fetch returns 404', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(error);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('404')).toBeInTheDocument());
  });

  it('renders the error branch on non-404 failures', async () => {
    (fetchVisualIdentity as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <EditVisualIdentityPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument(),
    );
  });
});
