import { ApiProperty } from '@nestjs/swagger';
import { BrandProfileDto } from './brand-profile.dto';

export class BrandProfileListEnvelopeDto {
  @ApiProperty({ type: Boolean, default: true })
  declare success: true;

  @ApiProperty({ type: [BrandProfileDto] })
  declare data: BrandProfileDto[];
}
