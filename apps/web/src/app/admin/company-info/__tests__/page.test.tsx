import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/company-info', () => ({
  CompanyInfoPage: (): ReactNode => <div data-testid="company-info-page" />,
}));

import CompanyInfoRoute from '../page';

describe('CompanyInfoRoute', () => {
  it('renders CompanyInfoPage directly without page-level auth gates (gates live in the parent layout)', () => {
    render(<CompanyInfoRoute />);
    const page = screen.getByTestId('company-info-page');
    expect(page).toBeInTheDocument();
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-route-gate')).not.toBeInTheDocument();
  });
});
