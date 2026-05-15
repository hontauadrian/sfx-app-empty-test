import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualIdentityCardPlaceholder } from '..';

describe('VisualIdentityCardPlaceholder', () => {
  it('renders the section title and CTA link with the documented href', () => {
    render(
      <VisualIdentityCardPlaceholder
        title="Visual identity"
        ctaLabel="+ Edit visual identity"
        ctaHref="/brands/brand-1/visual-identity/edit"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Visual identity' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '+ Edit visual identity' }),
    ).toHaveAttribute('href', '/brands/brand-1/visual-identity/edit');
  });
});
