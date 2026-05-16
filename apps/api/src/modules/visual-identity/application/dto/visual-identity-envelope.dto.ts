import { ApiProperty } from '@nestjs/swagger';
import { VisualIdentityDto } from './visual-identity.dto';

export class VisualIdentityEnvelopeDto {
  @ApiProperty({ type: Boolean, default: true })
  declare success: true;

  @ApiProperty({ type: VisualIdentityDto })
  declare data: VisualIdentityDto;
}
