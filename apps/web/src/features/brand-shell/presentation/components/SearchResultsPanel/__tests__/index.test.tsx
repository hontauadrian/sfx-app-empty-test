import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/features/presentation/localization';
import { SearchResultsPanel } from '../index';

function renderPanel(props: Parameters<typeof SearchResultsPanel>[0]): void {
  render(
    <LanguageProvider>
      <SearchResultsPanel {...props} />
    </LanguageProvider>,
  );
}

describe('SearchResultsPanel', () => {
  it('renders nothing when query is empty', () => {
    const { container } = render(
      <LanguageProvider>
        <SearchResultsPanel query="" isLoading={false} error={null} result={undefined} />
      </LanguageProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('renders the loading state when query is non-empty', () => {
    renderPanel({ query: 'w', isLoading: true, error: null, result: undefined });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the empty state when groups are empty', () => {
    renderPanel({
      query: 'w',
      isLoading: false,
      error: null,
      result: { query: 'w', brandId: 'b1', groups: [] },
    });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('renders grouped items with fragment + href', () => {
    renderPanel({
      query: 'wordmark',
      isLoading: false,
      error: null,
      result: {
        query: 'wordmark',
        brandId: 'b1',
        groups: [
          {
            section: 'dos-and-donts',
            items: [
              {
                id: 'dd1',
                sectionTitleKey: 'x',
                matchedFieldKey: 'x',
                fragment: 'wordmark fragment',
                href: '/admin/brand-guidelines/b1?section=dosAndDonts#entry-dd1',
              },
            ],
          },
        ],
      },
    });
    expect(screen.getByText("Dos & Don'ts")).toBeInTheDocument();
    expect(screen.getByText('wordmark fragment').closest('a')).toHaveAttribute(
      'href',
      '/admin/brand-guidelines/b1?section=dosAndDonts#entry-dd1',
    );
  });
});
