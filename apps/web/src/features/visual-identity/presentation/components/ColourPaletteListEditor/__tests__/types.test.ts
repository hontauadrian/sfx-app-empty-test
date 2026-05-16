import { describe, expect, it } from 'vitest';
import type { ColourPaletteListEditorProps } from '../types';

describe('ColourPaletteListEditorProps', () => {
  it('accepts a fully populated props bag', () => {
    const props: ColourPaletteListEditorProps = {
      control: {} as never,
      label: 'Colour palette',
      nameLabel: 'Name',
      hexLabel: 'Hex',
      usageLabel: 'Usage',
      addLabel: '+ Add',
      removeLabel: 'Remove',
      emptyPlaceholder: 'No entries yet',
      nameMaxLength: 120,
    };
    expect(props.label).toBe('Colour palette');
    expect(props.nameMaxLength).toBe(120);
  });
});
