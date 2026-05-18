import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../../../data/repositories/use-guideline-search-repository', () => ({
  useGuidelineSearchRepository: vi.fn(),
}));

import { useGuidelineSearchRepository } from '../../../../data/repositories/use-guideline-search-repository';
import { LanguageProvider } from '@/features/presentation/localization';
import { SearchResultsContainer } from '../index';

const mock = vi.mocked(useGuidelineSearchRepository);

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <LanguageProvider>{children}</LanguageProvider>
    </QueryClientProvider>
  );
}

describe('SearchResultsContainer', () => {
  it('renders nothing when query is empty', () => {
    mock.mockReturnValue({
      searchQuery: {
        isLoading: false,
        fetchStatus: 'idle',
        error: null,
        data: undefined,
      } as unknown as ReturnType<typeof useGuidelineSearchRepository>['searchQuery'],
    });
    const { container } = render(
      <SearchResultsContainer brandId="b1" query="" />,
      { wrapper: Wrapper },
    );
    expect(container.textContent).toBe('');
  });

  it('renders empty message when no results', () => {
    mock.mockReturnValue({
      searchQuery: {
        isLoading: false,
        fetchStatus: 'idle',
        error: null,
        data: { query: 'w', brandId: 'b1', groups: [] },
      } as unknown as ReturnType<typeof useGuidelineSearchRepository>['searchQuery'],
    });
    render(<SearchResultsContainer brandId="b1" query="w" />, { wrapper: Wrapper });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});
