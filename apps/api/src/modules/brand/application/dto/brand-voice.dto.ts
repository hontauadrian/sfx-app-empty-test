import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrandVoiceMessagingPillarDto {
  @ApiProperty({ type: String, description: 'Messaging pillar title', example: 'Trust' })
  declare title: string;

  @ApiProperty({
    type: String,
    description: 'Messaging pillar description',
    example: 'We deliver on every promise.',
  })
  declare description: string;
}

export class BrandVoiceAudienceRuleDto {
  @ApiProperty({ type: String, description: 'Target audience', example: 'Enterprise buyers' })
  declare audience: string;

  @ApiProperty({
    type: String,
    description: 'Rules for the audience',
    example: 'Lead with measurable outcomes.',
  })
  declare rules: string;
}

export class BrandVoiceApprovedExampleDto {
  @ApiProperty({ type: String, description: 'Approved example phrase', example: 'We partner closely.' })
  declare phrase: string;
}

export class BrandVoiceRejectedExampleDto {
  @ApiProperty({ type: String, description: 'Rejected example phrase', example: 'Cheap deal.' })
  declare phrase: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional reason for rejection',
    example: 'Negative tone',
  })
  declare reason: string | null;
}

export class BrandVoiceDto {
  @ApiProperty({ type: String, description: 'Owning brand id', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({
    type: String,
    description: 'Tone of voice',
    example: 'Warm, expert, never condescending',
  })
  declare tone: string;

  @ApiProperty({ type: [String], isArray: true, description: 'Preferred vocabulary list' })
  declare preferredVocabulary: readonly string[];

  @ApiProperty({ type: [String], isArray: true, description: 'Restricted vocabulary list' })
  declare restrictedVocabulary: readonly string[];

  @ApiProperty({
    type: [BrandVoiceMessagingPillarDto],
    isArray: true,
    description: 'Repeatable messaging pillars',
  })
  declare messagingPillars: readonly BrandVoiceMessagingPillarDto[];

  @ApiProperty({ type: String, description: 'Writing style rules', example: 'Use active voice.' })
  declare writingStyleRules: string;

  @ApiProperty({
    type: [BrandVoiceAudienceRuleDto],
    isArray: true,
    description: 'Per-audience rules',
  })
  declare audienceRules: readonly BrandVoiceAudienceRuleDto[];

  @ApiProperty({
    type: [BrandVoiceApprovedExampleDto],
    isArray: true,
    description: 'Approved example phrases',
  })
  declare approvedExamples: readonly BrandVoiceApprovedExampleDto[];

  @ApiProperty({
    type: [BrandVoiceRejectedExampleDto],
    isArray: true,
    description: 'Rejected example phrases',
  })
  declare rejectedExamples: readonly BrandVoiceRejectedExampleDto[];

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
