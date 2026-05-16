import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('../../../../data/remote/fetch-brand-voice', () => ({
  fetchBrandVoice: vi.fn(),
}));
vi.mock('../../../../data/remote/upsert-brand-voice', () => ({
  upsertBrandVoice: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { fetchBrandVoice } from '../../../../data/remote/fetch-brand-voice';
import { upsertBrandVoice } from '../../../../data/remote/upsert-brand-voice';
import { useRouter } from 'next/navigation';
import { LanguageProvider } from '@/features/presentation/localization';
import { VoiceEditPage } from '../index';

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

describe('VoiceEditPage', () => {
  let push: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    push = vi.fn();
    (useRouter as unknown as Mock).mockReturnValue({ push });
    (fetchBrandVoice as unknown as Mock).mockReset();
    (upsertBrandVoice as unknown as Mock).mockReset();
  });

  it('renders the loading skeleton initially', () => {
    (fetchBrandVoice as unknown as Mock).mockImplementation(
      () => new Promise(() => undefined),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    const section = document.querySelector('section[aria-busy="true"]');
    expect(section).not.toBeNull();
  });

  it('renders the form once the voice loads', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(empty);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument());
  });

  it('navigates back to the brand overview after a successful save', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(empty);
    (upsertBrandVoice as unknown as Mock).mockResolvedValueOnce(empty);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/brands/brand-1'));
  });

  it('navigates back on cancel without firing the upsert', async () => {
    (fetchBrandVoice as unknown as Mock).mockResolvedValueOnce(empty);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/brands/brand-1'));
    expect(upsertBrandVoice).not.toHaveBeenCalled();
  });

  it('renders the notFound branch when the fetch returns 404', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(error);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByText('404')).toBeInTheDocument());
  });

  it('renders the error branch on non-404 failures', async () => {
    (fetchBrandVoice as unknown as Mock).mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <VoiceEditPage brandId="brand-1" />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/An error occurred/i)).toBeInTheDocument(),
    );
  });
});
