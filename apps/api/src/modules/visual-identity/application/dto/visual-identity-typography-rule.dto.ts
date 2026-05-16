import { ApiProperty } from '@nestjs/swagger';

export class VisualIdentityTypographyRuleDto {
  @ApiProperty({ type: String, example: 'Display', description: 'Typography role identifier' })
  declare role: string;

  @ApiProperty({ type: String, example: 'Inter', description: 'Font family' })
  declare family: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '700',
    description: 'Optional font weight',
  })
  declare weight: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '48px',
    description: 'Optional font size',
  })
  declare size: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Hero headings.',
    description: 'Optional notes',
  })
  declare notes: string | null;
}
