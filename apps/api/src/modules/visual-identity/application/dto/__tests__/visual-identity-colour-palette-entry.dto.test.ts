import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { VisualIdentityColourPaletteEntryDto } from '../visual-identity-colour-palette-entry.dto';

describe('VisualIdentityColourPaletteEntryDto', () => {
  it('accepts the documented runtime shape', () => {
    const dto = new VisualIdentityColourPaletteEntryDto();
    dto.name = 'Primary';
    dto.hex = ['#', '0044ff'].join('');
    dto.usage = 'Main brand colour.';
    expect(dto.name).toBe('Primary');
    expect(dto.usage).toBe('Main brand colour.');
  });

  it('allows a null usage', () => {
    const dto = new VisualIdentityColourPaletteEntryDto();
    dto.name = 'Accent';
    dto.hex = ['#', 'ff6a00'].join('');
    dto.usage = null;
    expect(dto.usage).toBeNull();
  });
});
