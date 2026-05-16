import { ApiProperty } from '@nestjs/swagger';
import { BrandVoiceDto } from './brand-voice.dto';

export class BrandVoiceEnvelopeDto {
  @ApiProperty({ type: Boolean, default: true })
  declare success: true;

  @ApiProperty({ type: BrandVoiceDto })
  declare data: BrandVoiceDto;
}
