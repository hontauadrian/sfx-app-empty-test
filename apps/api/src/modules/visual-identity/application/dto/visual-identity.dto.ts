import { ApiProperty } from '@nestjs/swagger';
import { VisualIdentityColourPaletteEntryDto } from './visual-identity-colour-palette-entry.dto';
import { VisualIdentityTypographyRuleDto } from './visual-identity-typography-rule.dto';

export class VisualIdentityDto {
  @ApiProperty({ type: String, example: 'vi-cuid', description: 'Visual identity row id (empty when no row yet)' })
  declare id: string;

  @ApiProperty({ type: String, example: 'cuid12345', description: 'Owning brand identifier' })
  declare brandId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Maintain clear space.',
    description: 'Logo usage rules or null',
  })
  declare logoUsageRules: string | null;

  @ApiProperty({ type: () => [VisualIdentityColourPaletteEntryDto] })
  declare colourPalette: readonly VisualIdentityColourPaletteEntryDto[];

  @ApiProperty({ type: () => [VisualIdentityTypographyRuleDto] })
  declare typographyRules: readonly VisualIdentityTypographyRuleDto[];

  @ApiProperty({ type: String, nullable: true })
  declare spacingLayoutGuidance: string | null;

  @ApiProperty({ type: String, nullable: true })
  declare imageStyleGuidance: string | null;

  @ApiProperty({ type: String, nullable: true })
  declare iconographyGuidance: string | null;

  @ApiProperty({ type: String, nullable: true })
  declare usageRestrictions: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
    description: 'Creation timestamp (ISO)',
  })
  declare createdAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
    description: 'Last update timestamp (ISO)',
  })
  declare updatedAt: string;
}
