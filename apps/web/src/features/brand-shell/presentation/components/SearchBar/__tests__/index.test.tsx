import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/features/presentation/localization';
import { SearchBar } from '../index';

function renderBar(value = '', onChange = vi.fn()): ReturnType<typeof vi.fn> {
  render(
    <LanguageProvider>
      <SearchBar value={value} onChange={onChange} />
    </LanguageProvider>,
  );
  return onChange;
}

describe('SearchBar', () => {
  it('renders the placeholder from translations', () => {
    renderBar();
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search this brand…');
  });

  it('fires onChange when the input value changes', () => {
    const handler = renderBar();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'word' } });
    expect(handler).toHaveBeenCalledWith('word');
  });
});
