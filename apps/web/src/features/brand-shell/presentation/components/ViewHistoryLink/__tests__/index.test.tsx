import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/features/presentation/localization/language-provider';

import { ViewHistoryLink } from '../index';

function renderWithProviders(node: React.ReactNode): void {
  render(<LanguageProvider>{node}</LanguageProvider>);
}

describe('ViewHistoryLink', () => {
  it('renders the View history label in English', () => {
    renderWithProviders(<ViewHistoryLink brandId="brand-1" section="voice" />);
    expect(screen.getByText('View history')).toBeDefined();
  });

  it('renders an anchor pointing at /admin/brand-guidelines/{brandId}/history', () => {
    renderWithProviders(<ViewHistoryLink brandId="brand-42" section="visual" />);
    const link = screen.getByTestId('view-history-link-visual') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/brand-guidelines/brand-42/history');
  });

  it('exposes a per-section data-testid for each placement', () => {
    renderWithProviders(<ViewHistoryLink brandId="brand-1" section="dosAndDonts" />);
    expect(screen.getByTestId('view-history-link-dosAndDonts')).toBeDefined();
  });
});
