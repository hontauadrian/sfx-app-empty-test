import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DosDontsEntryDto {
  @ApiProperty({ type: String, description: 'Entry identifier', example: 'clxdd0001' })
  declare id: string;

  @ApiProperty({ type: String, description: 'Owning brand id', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({ type: String, enum: ['do', 'dont'], description: 'Entry type', example: 'do' })
  declare type: 'do' | 'dont';

  @ApiProperty({
    type: String,
    enum: ['tone', 'vocabulary', 'visuals', 'legal', 'campaign-messaging'],
    description: 'Extensible category',
    example: 'tone',
  })
  declare category: string;

  @ApiProperty({ type: String, description: 'Rule text (1-4000 chars)', example: 'Use the official wordmark.' })
  declare ruleText: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional contextual example illustrating the rule',
    example: 'e.g. social header banners',
  })
  declare exampleText: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record creation timestamp' })
  declare createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record last-update timestamp' })
  declare updatedAt: Date;
}

export class DosDontsListDto {
  @ApiProperty({ type: [DosDontsEntryDto], isArray: true, description: 'Active D&D entries newest-first' })
  declare items: readonly DosDontsEntryDto[];
}
