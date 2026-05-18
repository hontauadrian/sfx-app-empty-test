import { ApiProperty } from '@nestjs/swagger';

export class GuidelineSearchItemDto {
  @ApiProperty({ type: String, description: 'Source row id where applicable', example: 'clxdd0001' })
  declare id: string;

  @ApiProperty({
    type: String,
    description: 'Translation key for the section heading',
    example: 'admin.brandGuidelines.dosAndDonts.sectionTitle',
  })
  declare sectionTitleKey: string;

  @ApiProperty({
    type: String,
    description: 'Translation key for the matched field label',
    example: 'admin.brandGuidelines.dosAndDonts.fields.ruleText.label',
  })
  declare matchedFieldKey: string;

  @ApiProperty({
    type: String,
    description: 'Truncated contextual snippet around the hit (≤200 chars)',
    example: 'Always use the official wordmark in marketing.',
  })
  declare fragment: string;

  @ApiProperty({
    type: String,
    description: 'Deep-link href into the active brand subsection',
    example: '/admin/brand-guidelines/clxbrand0001?section=dosAndDonts#entry-clxdd0001',
  })
  declare href: string;
}

export class GuidelineSearchGroupDto {
  @ApiProperty({
    type: String,
    enum: ['voice', 'visual', 'dos-and-donts', 'metadata'],
    description: 'Source section identifier',
    example: 'dos-and-donts',
  })
  declare section: string;

  @ApiProperty({ type: [GuidelineSearchItemDto], isArray: true, description: 'Hits within this section' })
  declare items: readonly GuidelineSearchItemDto[];
}

export class GuidelineSearchResponseDto {
  @ApiProperty({ type: String, description: 'Echoed query (trimmed)', example: 'wordmark' })
  declare query: string;

  @ApiProperty({ type: String, description: 'Brand the search was scoped to', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({
    type: [GuidelineSearchGroupDto],
    isArray: true,
    description: 'Result groups (one per matched section)',
  })
  declare groups: readonly GuidelineSearchGroupDto[];
}
