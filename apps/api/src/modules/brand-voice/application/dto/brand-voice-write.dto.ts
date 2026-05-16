import { ApiProperty } from '@nestjs/swagger';
import { AudienceRuleDto } from './audience-rule.dto';

export class BrandVoiceWriteDto {
  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: 4000,
    example: 'Warm, direct, plain-spoken.',
    description: 'Tone of voice (0..4000 chars). Empty string normalises to null.',
  })
  declare toneOfVoice?: string | null;

  @ApiProperty({ type: [String], required: false, default: [], example: ['craft'] })
  declare preferredVocabulary?: readonly string[];

  @ApiProperty({ type: [String], required: false, default: [], example: ['utilize'] })
  declare restrictedVocabulary?: readonly string[];

  @ApiProperty({ type: [String], required: false, default: [], example: ['Trust'] })
  declare messagingPillars?: readonly string[];

  @ApiProperty({
    type: [String],
    required: false,
    default: [],
    example: ['Use active voice.'],
  })
  declare writingStyleRules?: readonly string[];

  @ApiProperty({ type: [AudienceRuleDto], required: false, default: [] })
  declare audienceRules?: readonly AudienceRuleDto[];

  @ApiProperty({
    type: [String],
    required: false,
    default: [],
    example: ['We build with care.'],
  })
  declare approvedExamplePhrases?: readonly string[];

  @ApiProperty({
    type: [String],
    required: false,
    default: [],
    example: ['Synergize value-add.'],
  })
  declare rejectedExamplePhrases?: readonly string[];
}
