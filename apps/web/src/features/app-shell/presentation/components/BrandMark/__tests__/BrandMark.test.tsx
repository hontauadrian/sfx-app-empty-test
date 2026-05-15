import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '..';

describe('BrandMark', () => {
  it('renders the label inside a link pointing at the home route', () => {
    render(<BrandMark label="Brand Guidelines" href="/" />);
    const link = screen.getByRole('link', { name: 'Brand Guidelines' });
    expect(link).toHaveAttribute('href', '/');
  });
});
