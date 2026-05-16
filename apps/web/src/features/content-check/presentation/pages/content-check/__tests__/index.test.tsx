import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../use-content-check', () => ({
  useContentCheck: vi.fn(),
}));

import { useContentCheck } from '../use-content-check';
import { ContentCheckPage } from '../index';

const baseUiModel = {
  state: 'noActiveBrand' as const,
  pageTitle: 'Content check',
  activeBrandLabel: 'Active brand',
  activeBrandName: null,
  pastedTextLabel: 'Paste content to check',
  pastedTextPlaceholder: 'Paste here',
  pastedTextValue: '',
  pastedTextMaxLength: 10000,
  categoryLabel: 'Category',
  categoryOptions: [
    { value: '' as const, label: 'All categories' },
    { value: 'tone' as const, label: 'Tone' },
  ],
  submitLabel: 'Check content',
  referenceTextLabel: 'Reference text',
  resultsTitle: 'Results',
  suggestedCorrectionLabel: 'Suggested correction',
  groups: [],
  emptyStateTitle: 'Pick title',
  emptyStateBody: 'Pick body',
  emptyStateCtaLabel: 'Pick a brand',
  emptyStateCtaHref: '/',
  errorMessage: null,
};

function setHook(returnValue: Record<string, unknown>): void {
  (useContentCheck as unknown as Mock).mockReturnValue({
    uiModel: baseUiModel,
    register: (): Record<string, unknown> => ({}),
    handleSubmit: () => (): undefined => undefined,
    handleCheckContent: (): undefined => undefined,
    formErrors: {},
    ...returnValue,
  });
}

describe('ContentCheckPage', () => {
  beforeEach(() => {
    (useContentCheck as unknown as Mock).mockReset();
  });

  it('renders the no-active-brand empty state with the Pick a brand CTA', () => {
    setHook({});
    render(<ContentCheckPage />);
    expect(screen.getByRole('heading', { name: 'Pick title' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pick a brand' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('button', { name: 'Check content' })).toBeNull();
  });

  it('renders the brand-not-found empty state', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'brandNotFound',
        emptyStateTitle: 'Brand gone',
        emptyStateBody: 'Active brand is no longer available.',
        emptyStateCtaLabel: 'Pick a brand',
        emptyStateCtaHref: '/',
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByRole('heading', { name: 'Brand gone' })).toBeInTheDocument();
  });

  it('renders the form when an active brand is present', () => {
    setHook({
      uiModel: { ...baseUiModel, state: 'loading' },
    });
    render(<ContentCheckPage />);
    expect(screen.getByRole('button', { name: 'Check content' })).toBeInTheDocument();
    expect(screen.getByLabelText('Paste content to check')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
  });

  it('renders the loading skeleton when state is loading', () => {
    setHook({
      uiModel: { ...baseUiModel, state: 'loading' },
    });
    render(<ContentCheckPage />);
    expect(screen.getByLabelText('Results')).toBeInTheDocument();
  });

  it('renders the error alert when state is error', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'error',
        errorMessage: 'Could not load',
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load');
  });

  it('renders the zeroMatches empty state with the Add CTA pointing at the brand overview', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'zeroMatches',
        emptyStateTitle: 'No matches',
        emptyStateBody: 'No dos or donts yet',
        emptyStateCtaLabel: "+ Add do/don't",
        emptyStateCtaHref: '/brands/brand-1',
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByRole('link', { name: "+ Add do/don't" })).toHaveAttribute(
      'href',
      '/brands/brand-1',
    );
  });

  it('renders the populated result list when state is populated', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'populated',
        groups: [
          {
            key: 'tone',
            categoryLabel: 'Tone',
            rows: [
              {
                key: 'tone:do',
                type: 'do',
                typeLabel: 'Do',
                entries: [
                  {
                    id: '1',
                    title: 'Be warm',
                    body: 'Use warm phrasing.',
                    suggestedCorrection: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByRole('heading', { name: 'Tone' })).toBeInTheDocument();
    expect(screen.getByText('Be warm')).toBeInTheDocument();
  });

  it('renders the active brand name in the header when present', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'populated',
        activeBrandName: 'Acme',
        groups: [],
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('echoes the pasted text in the Reference text block when non-empty', () => {
    setHook({
      uiModel: {
        ...baseUiModel,
        state: 'populated',
        pastedTextValue: 'Hello\nworld',
        groups: [],
      },
    });
    render(<ContentCheckPage />);
    expect(screen.getByLabelText('Reference text')).toBeInTheDocument();
    expect(
      screen.getByText((_text, node) => node?.textContent === 'Hello\nworld'),
    ).toBeInTheDocument();
  });
});
