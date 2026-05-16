import { ApiProperty } from '@nestjs/swagger';

export class AudienceRuleDto {
  @ApiProperty({ type: String, example: 'Gen Z', description: 'Audience segment label' })
  declare audience: string;

  @ApiProperty({
    type: String,
    example: 'Speak peer-to-peer.',
    description: 'Communication rule applied to this audience',
  })
  declare rule: string;
}
