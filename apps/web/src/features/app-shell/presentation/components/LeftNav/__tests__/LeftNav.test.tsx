import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeftNav } from '..';

describe('LeftNav', () => {
  it('renders every nav item as a link with the documented href', () => {
    render(
      <LeftNav
        ariaLabel="Brand sections"
        items={[
          { key: 'overview', label: 'Overview', href: '/brands/brand-1' },
          { key: 'voice', label: 'Brand voice', href: '/brands/brand-1#voice' },
          { key: 'visual', label: 'Visual identity', href: '/brands/brand-1#visual' },
        ]}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Brand sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/brands/brand-1',
    );
    expect(screen.getByRole('link', { name: 'Brand voice' })).toHaveAttribute(
      'href',
      '/brands/brand-1#voice',
    );
    expect(screen.getByRole('link', { name: 'Visual identity' })).toHaveAttribute(
      'href',
      '/brands/brand-1#visual',
    );
  });
});
