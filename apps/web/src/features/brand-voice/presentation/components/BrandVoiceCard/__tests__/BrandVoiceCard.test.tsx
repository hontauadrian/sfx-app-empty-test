import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));

import { fetchBrandVoice } from '../../../../data/remote/fetch-brand-voice';
import { LanguageProvider } from '@/features/presentation/localization';
import { BrandVoiceCard } from '../index';

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

const empty = {
  brandProfileId: 'brand-1',
  toneOfVoice: null,
  preferredVocabulary: [],
  restrictedVocabulary: [],
  messagingPillars: [],
  writingStyleRules: [],
  audienceRules: [],
  approvedExamplePhrases: [],
  rejectedExamplePhrases: [],
  createdAt: null,
  updatedAt: null,
};

describe('BrandVoiceCard', () => {
  beforeEach(() => {
    (fetchBrandVoice as unknown as Mock).mockReset();
  });

  it('renders the loading skeleton initially', () => {
    (fetchBrandVoice as unknown as Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="brand-1" />
      </Wrapper>,
    );
    expect(screen.getByRole('region', { busy: true })).toBeInTheDocument();
  });

  it('renders the empty-state card when no fields are populated', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(empty);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getAllByText('+ Edit brand voice').length).toBeGreaterThan(0),
    );
    expect(
      screen.getByText(/This section will host the brand's voice/i),
    ).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: '+ Edit brand voice' });
    expect(cta).toHaveAttribute('href', '/brands/brand-1/voice/edit');
  });

  it('renders the summary card when fields are populated', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce({
      ...empty,
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft', 'trust', 'depth'],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer.' }],
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Warm.')).toBeInTheDocument());
    expect(screen.getByText(/Preferred vocabulary/i)).toBeInTheDocument();
    expect(screen.getByText(/Gen Z/)).toBeInTheDocument();
  });

  it('shows the error message on non-404 error', async () => {
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument(),
    );
  });

  it('falls back to the empty-state when fetch returns 404 (defensive)', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(error);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getAllByText('+ Edit brand voice').length).toBeGreaterThan(0),
    );
  });
});
