import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandVoiceCardPlaceholder } from '..';

describe('BrandVoiceCardPlaceholder', () => {
  it('renders the section title and CTA link with the documented href', () => {
    render(
      <BrandVoiceCardPlaceholder
        title="Brand voice"
        ctaLabel="+ Edit brand voice"
        ctaHref="/brands/brand-1/voice/edit"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Brand voice' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: '+ Edit brand voice' });
    expect(cta).toHaveAttribute('href', '/brands/brand-1/voice/edit');
  });
});
