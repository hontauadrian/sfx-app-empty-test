import { ApiProperty } from '@nestjs/swagger';

export class BrandProfileWriteDto {
  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 120,
    example: 'Acme Brand',
    description: 'Human-readable brand name (1..120 after trim).',
  })
  declare name: string;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 2000,
    example: 'A short summary of the brand',
    description:
      'Optional brand description (0..2000 chars after trim). Send null on PUT to clear.',
  })
  declare description?: string | null;
}
