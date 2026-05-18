import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/features/brand-shell', () => ({
  BrandGuidelinesEmptyPage: (): ReactNode => (
    <div data-testid="brand-guidelines-empty-page" />
  ),
  BrandGuidelinesDetailPage: (): ReactNode => null,
}));

import Page from '../page';

describe('app/admin/brand-guidelines/page', () => {
  it('renders the BrandGuidelinesEmptyPage feature', () => {
    render(<Page />);
    expect(screen.getByTestId('brand-guidelines-empty-page')).toBeInTheDocument();
  });
});
