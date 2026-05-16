import { ApiProperty } from '@nestjs/swagger';
import {
  DOS_AND_DONT_BODY_MAX_LENGTH,
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TITLE_MAX_LENGTH,
  DOS_AND_DONT_TYPE_VALUES,
} from '@sfx/validation';

export class DosAndDontWriteDto {
  @ApiProperty({
    type: String,
    enum: DOS_AND_DONT_TYPE_VALUES,
    example: 'do',
    description: 'Entry type (do or dont).',
  })
  declare type: string;

  @ApiProperty({
    type: String,
    enum: DOS_AND_DONT_CATEGORY_VALUES,
    example: 'tone',
    description: 'Entry category.',
  })
  declare category: string;

  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: DOS_AND_DONT_TITLE_MAX_LENGTH,
    example: 'Use active voice',
    description: `Short title (1..${DOS_AND_DONT_TITLE_MAX_LENGTH} chars after trim).`,
  })
  declare title: string;

  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: DOS_AND_DONT_BODY_MAX_LENGTH,
    example: 'Prefer active voice over passive.',
    description: `Full body (1..${DOS_AND_DONT_BODY_MAX_LENGTH} chars after trim).`,
  })
  declare body: string;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    maxLength: DOS_AND_DONT_BODY_MAX_LENGTH,
    example: 'Rewrite passive verbs as active.',
    description: `Optional suggested correction (0..${DOS_AND_DONT_BODY_MAX_LENGTH} chars). Empty string normalises to null.`,
  })
  declare suggestedCorrection?: string | null;
}
