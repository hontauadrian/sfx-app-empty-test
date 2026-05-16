import { ApiProperty } from '@nestjs/swagger';
import { DosAndDontDto } from './dos-and-dont.dto';

export class DosAndDontEnvelopeDto {
  @ApiProperty({ type: Boolean, default: true })
  declare success: true;

  @ApiProperty({ type: DosAndDontDto })
  declare data: DosAndDontDto;
}
