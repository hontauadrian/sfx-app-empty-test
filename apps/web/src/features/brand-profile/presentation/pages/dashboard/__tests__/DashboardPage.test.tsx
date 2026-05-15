import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DashboardPage } from '..';

const useDashboardMock = vi.fn();

vi.mock('../use-dashboard', () => ({
  useDashboard: (): unknown => useDashboardMock(),
}));

const baseModel = {
  isLoading: false,
  hasError: false,
  emptyStateTitle: 'No brands yet',
  emptyStateBody: 'Create your first brand to start.',
  emptyStateCtaLabel: '+ Create brand',
  emptyStateCtaHref: '/brands/new',
  showEmptyState: false,
  redirectTo: null,
  loadingLabel: 'Loading...',
  errorLabel: 'Error',
};

describe('DashboardPage', () => {
  beforeEach(() => {
    useDashboardMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the skeleton when loading', () => {
    (useDashboardMock as Mock).mockReturnValue({
      uiModel: { ...baseModel, isLoading: true },
    });
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the empty-state CTA when the user owns no brands', () => {
    (useDashboardMock as Mock).mockReturnValue({
      uiModel: { ...baseModel, showEmptyState: true },
    });
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'No brands yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Create brand' })).toHaveAttribute(
      'href',
      '/brands/new',
    );
  });

  it('renders the error state when the query fails', () => {
    (useDashboardMock as Mock).mockReturnValue({ uiModel: { ...baseModel, hasError: true } });
    render(<DashboardPage />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders the redirecting skeleton when a redirect is queued', () => {
    (useDashboardMock as Mock).mockReturnValue({
      uiModel: { ...baseModel, redirectTo: '/brands/b' },
    });
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
