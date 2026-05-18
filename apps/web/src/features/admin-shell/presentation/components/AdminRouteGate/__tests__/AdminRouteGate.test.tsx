import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../use-admin-route-gate', () => ({
  useAdminRouteGate: vi.fn(),
}));

import { AdminRouteGate } from '../index';
import { useAdminRouteGate } from '../use-admin-route-gate';

describe('AdminRouteGate', () => {
  beforeEach(() => {
    vi.mocked(useAdminRouteGate).mockReset();
  });

  it('renders children when the uiModel is allowed', () => {
    vi.mocked(useAdminRouteGate).mockReturnValue({ uiModel: { status: 'allowed' } });

    render(
      <AdminRouteGate>
        <div data-testid="protected">Protected</div>
      </AdminRouteGate>,
    );

    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('renders a loading skeleton when the uiModel is loading and hides children', () => {
    vi.mocked(useAdminRouteGate).mockReturnValue({ uiModel: { status: 'loading' } });

    render(
      <AdminRouteGate>
        <div data-testid="protected">Protected</div>
      </AdminRouteGate>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the deny surface with translated labels and a back-to-home link', () => {
    vi.mocked(useAdminRouteGate).mockReturnValue({
      uiModel: {
        status: 'denied',
        title: 'Access denied',
        message: 'No permission',
        backToHomeLabel: 'Back to Home',
        backToHomeHref: '/',
      },
    });

    render(
      <AdminRouteGate>
        <div data-testid="protected">Protected</div>
      </AdminRouteGate>,
    );

    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
    expect(screen.getByText('No permission')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Back to Home' });
    expect(link).toHaveAttribute('href', '/');
  });

  it('uses a <main> landmark on the deny surface for a11y', () => {
    vi.mocked(useAdminRouteGate).mockReturnValue({
      uiModel: {
        status: 'denied',
        title: 'Access denied',
        message: 'No permission',
        backToHomeLabel: 'Back to Home',
        backToHomeHref: '/',
      },
    });

    render(
      <AdminRouteGate>
        <div>child</div>
      </AdminRouteGate>,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
