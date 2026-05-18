import 'reflect-metadata';
import {
  VisualIdentityColorPaletteEntryDto,
  VisualIdentityDto,
  VisualIdentityTypographyEntryDto,
} from '../visual-identity.dto';

const EXPECTED_FIELDS: ReadonlyArray<keyof VisualIdentityDto> = [
  'brandId',
  'logoUsage',
  'colorPalette',
  'typography',
  'spacingGuidance',
  'imageStyleGuidance',
  'iconographyGuidance',
  'usageRestrictions',
  'createdAt',
  'updatedAt',
];

function meta(target: object, field: string): { type?: unknown; nullable?: boolean; isArray?: boolean } | undefined {
  return Reflect.getMetadata('swagger/apiModelProperties', target, field) as
    | { type?: unknown; nullable?: boolean; isArray?: boolean }
    | undefined;
}

describe('VisualIdentityDto', () => {
  it('is instantiable as a plain class', () => {
    expect(new VisualIdentityDto()).toBeInstanceOf(VisualIdentityDto);
  });

  it.each(EXPECTED_FIELDS)('%s carries an explicit `type`', (field) => {
    const m = meta(VisualIdentityDto.prototype, field as string);
    expect(m, `metadata for ${field}`).toBeDefined();
    expect(m?.type, `type for ${field}`).toBeDefined();
  });

  it('colorPalette is declared as an array', () => {
    expect(meta(VisualIdentityDto.prototype, 'colorPalette')?.isArray).toBe(true);
  });

  it('typography is declared as an array', () => {
    expect(meta(VisualIdentityDto.prototype, 'typography')?.isArray).toBe(true);
  });
});

describe('VisualIdentity sub-DTOs', () => {
  it('color palette entry declares name + hex', () => {
    expect(meta(VisualIdentityColorPaletteEntryDto.prototype, 'name')?.type).toBeDefined();
    expect(meta(VisualIdentityColorPaletteEntryDto.prototype, 'hex')?.type).toBeDefined();
  });

  it('color palette usageNotes is nullable', () => {
    expect(meta(VisualIdentityColorPaletteEntryDto.prototype, 'usageNotes')?.nullable).toBe(true);
  });

  it('typography entry declares font + weight', () => {
    expect(meta(VisualIdentityTypographyEntryDto.prototype, 'font')?.type).toBeDefined();
    expect(meta(VisualIdentityTypographyEntryDto.prototype, 'weight')?.type).toBeDefined();
  });

  it('typography usageContext is nullable', () => {
    expect(meta(VisualIdentityTypographyEntryDto.prototype, 'usageContext')?.nullable).toBe(true);
  });
});
