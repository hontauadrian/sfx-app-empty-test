import { ApiProperty } from '@nestjs/swagger';

export class VisualIdentityColourPaletteEntryDto {
  @ApiProperty({ type: String, example: 'Primary', description: 'Colour palette entry name' })
  declare name: string;

  @ApiProperty({
    type: String,
    description: 'Hex value (#RGB or #RRGGBB, case-insensitive). User-provided runtime value.',
  })
  declare hex: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Main brand colour.',
    description: 'Optional usage note',
  })
  declare usage: string | null;
}
