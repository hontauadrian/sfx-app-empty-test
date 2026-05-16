import { ApiProperty } from '@nestjs/swagger';
import { VisualIdentityColourPaletteEntryDto } from './visual-identity-colour-palette-entry.dto';
import { VisualIdentityTypographyRuleDto } from './visual-identity-typography-rule.dto';

export class VisualIdentityWriteDto {
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 4000,
    example: 'Maintain clear space equal to the x-height of the logo on all sides.',
    description: 'Logo usage rules (0..4000 chars). Empty string normalises to null.',
  })
  declare logoUsageRules?: string | null;

  @ApiProperty({ type: () => [VisualIdentityColourPaletteEntryDto], required: false, default: [] })
  declare colourPalette?: readonly VisualIdentityColourPaletteEntryDto[];

  @ApiProperty({ type: () => [VisualIdentityTypographyRuleDto], required: false, default: [] })
  declare typographyRules?: readonly VisualIdentityTypographyRuleDto[];

  @ApiProperty({ type: String, nullable: true, required: false, example: 'Use an 8px baseline grid.' })
  declare spacingLayoutGuidance?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    example: 'Natural light photography with warm tones.',
  })
  declare imageStyleGuidance?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    example: '1.5px stroke, rounded corners.',
  })
  declare iconographyGuidance?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    example: 'Never recolour the logo.',
  })
  declare usageRestrictions?: string | null;
}
