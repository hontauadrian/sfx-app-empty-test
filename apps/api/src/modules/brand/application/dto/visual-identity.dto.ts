import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VisualIdentityColorPaletteEntryDto {
  @ApiProperty({ type: String, description: 'Color label', example: 'Primary' })
  declare name: string;

  @ApiProperty({ type: String, description: 'Hex color value', example: 'Primary swatch hex' })
  declare hex: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional usage notes',
    example: 'CTA buttons',
  })
  declare usageNotes: string | null;
}

export class VisualIdentityTypographyEntryDto {
  @ApiProperty({ type: String, description: 'Font family', example: 'Inter' })
  declare font: string;

  @ApiProperty({ type: String, description: 'Font weight token', example: '500' })
  declare weight: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional usage context',
    example: 'Body copy',
  })
  declare usageContext: string | null;
}

export class VisualIdentityDto {
  @ApiProperty({ type: String, description: 'Owning brand id', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({
    type: String,
    description: 'Logo usage guidance',
    example: 'Use the full-color logo on white backgrounds only.',
  })
  declare logoUsage: string;

  @ApiProperty({
    type: [VisualIdentityColorPaletteEntryDto],
    isArray: true,
    description: 'Color palette entries',
  })
  declare colorPalette: readonly VisualIdentityColorPaletteEntryDto[];

  @ApiProperty({
    type: [VisualIdentityTypographyEntryDto],
    isArray: true,
    description: 'Typography entries',
  })
  declare typography: readonly VisualIdentityTypographyEntryDto[];

  @ApiProperty({
    type: String,
    description: 'Spacing & layout guidance',
    example: 'Use 8px grid.',
  })
  declare spacingGuidance: string;

  @ApiProperty({
    type: String,
    description: 'Image style guidance',
    example: 'Documentary realism.',
  })
  declare imageStyleGuidance: string;

  @ApiProperty({
    type: String,
    description: 'Iconography guidance',
    example: 'Outlined, 24px stroke 2.',
  })
  declare iconographyGuidance: string;

  @ApiProperty({
    type: String,
    description: 'Usage restrictions',
    example: 'No drop shadows.',
  })
  declare usageRestrictions: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Record creation timestamp',
  })
  declare createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Record last-update timestamp',
  })
  declare updatedAt: Date;
}
