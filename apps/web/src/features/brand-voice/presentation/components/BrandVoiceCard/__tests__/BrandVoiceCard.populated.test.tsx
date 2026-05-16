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

describe('BrandVoiceCard populated branches', () => {
  beforeEach(() => {
    (fetchBrandVoice as unknown as Mock).mockReset();
  });

  it('renders the +N more indicator when a list exceeds 5 items', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce({
      brandProfileId: 'b',
      toneOfVoice: null,
      preferredVocabulary: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [
        { audience: 'a', rule: 'r1' },
        { audience: 'b', rule: 'r2' },
        { audience: 'c', rule: 'r3' },
        { audience: 'd', rule: 'r4' },
        { audience: 'e', rule: 'r5' },
        { audience: 'f', rule: 'r6' },
      ],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="b" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText(/\+2 more/)).toBeInTheDocument());
    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });

  it('renders only the tone-of-voice block when no lists are populated', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce({
      brandProfileId: 'b',
      toneOfVoice: 'Direct.',
      preferredVocabulary: [],
      restrictedVocabulary: [],
      messagingPillars: [],
      writingStyleRules: [],
      audienceRules: [],
      approvedExamplePhrases: [],
      rejectedExamplePhrases: [],
      createdAt: null,
      updatedAt: null,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <BrandVoiceCard brandId="b" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('Direct.')).toBeInTheDocument());
  });
});
