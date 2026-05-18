import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/company-info', () => ({
  CompanyInfoHistoryPage: (): ReactNode => <div data-testid="company-info-history-page" />,
  CompanyInfoHistoryDetailPage: ({ versionId }: { versionId: string }): ReactNode => (
    <div data-testid="company-info-history-detail-page" data-version-id={versionId} />
  ),
  CompanyInfoPage: (): ReactNode => <div data-testid="company-info-page" />,
}));

import CompanyInfoHistoryDetailRoute from '../page';

describe('CompanyInfoHistoryDetailRoute', () => {
  it('awaits the params promise and forwards versionId to CompanyInfoHistoryDetailPage', async () => {
    const element = await CompanyInfoHistoryDetailRoute({
      params: Promise.resolve({ versionId: 'v-42' }),
    });
    render(<>{element}</>);
    const detail = screen.getByTestId('company-info-history-detail-page');
    expect(detail).toBeInTheDocument();
    expect(detail).toHaveAttribute('data-version-id', 'v-42');
  });

  it('does not render the gate elements (parent layout handles auth)', async () => {
    const element = await CompanyInfoHistoryDetailRoute({
      params: Promise.resolve({ versionId: 'v-1' }),
    });
    render(<>{element}</>);
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-route-gate')).not.toBeInTheDocument();
  });
});
