import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/company-info', () => ({
  CompanyInfoHistoryPage: (): ReactNode => <div data-testid="company-info-history-page" />,
  CompanyInfoHistoryDetailPage: (): ReactNode => <div data-testid="company-info-history-detail-page" />,
  CompanyInfoPage: (): ReactNode => <div data-testid="company-info-page" />,
}));

import CompanyInfoHistoryRoute from '../page';

describe('CompanyInfoHistoryRoute', () => {
  it('renders CompanyInfoHistoryPage directly without page-level auth gates (gates live in the parent layout)', () => {
    render(<CompanyInfoHistoryRoute />);
    expect(screen.getByTestId('company-info-history-page')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-route-gate')).not.toBeInTheDocument();
  });
});
