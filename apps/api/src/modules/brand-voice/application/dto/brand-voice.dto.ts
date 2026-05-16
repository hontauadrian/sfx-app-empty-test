import { ApiProperty } from '@nestjs/swagger';
import { AudienceRuleDto } from './audience-rule.dto';

export class BrandVoiceDto {
  @ApiProperty({ type: String, example: 'cuid12345', description: 'Owning brand identifier' })
  declare brandProfileId: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Warm, direct, plain-spoken.',
    description: 'Tone of voice or null when unset',
  })
  declare toneOfVoice: string | null;

  @ApiProperty({ type: [String], example: ['craft'] })
  declare preferredVocabulary: readonly string[];

  @ApiProperty({ type: [String], example: ['utilize'] })
  declare restrictedVocabulary: readonly string[];

  @ApiProperty({ type: [String], example: ['Trust'] })
  declare messagingPillars: readonly string[];

  @ApiProperty({ type: [String], example: ['Use active voice.'] })
  declare writingStyleRules: readonly string[];

  @ApiProperty({ type: [AudienceRuleDto] })
  declare audienceRules: readonly AudienceRuleDto[];

  @ApiProperty({ type: [String], example: ['We build with care.'] })
  declare approvedExamplePhrases: readonly string[];

  @ApiProperty({ type: [String], example: ['Synergize value-add.'] })
  declare rejectedExamplePhrases: readonly string[];

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  declare createdAt: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
  })
  declare updatedAt: string | null;
}
