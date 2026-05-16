import { ApiProperty } from '@nestjs/swagger';
import {
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TYPE_VALUES,
} from '@sfx/validation';

export class DosAndDontDto {
  @ApiProperty({ type: String, example: 'cuid67890', description: 'Entry identifier' })
  declare id: string;

  @ApiProperty({ type: String, example: 'cuid12345', description: 'Owning brand identifier' })
  declare brandId: string;

  @ApiProperty({
    type: String,
    enum: DOS_AND_DONT_TYPE_VALUES,
    example: 'do',
    description: 'Entry type (do/dont)',
  })
  declare type: string;

  @ApiProperty({
    type: String,
    enum: DOS_AND_DONT_CATEGORY_VALUES,
    example: 'tone',
    description: 'Entry category',
  })
  declare category: string;

  @ApiProperty({ type: String, example: 'Use active voice' })
  declare title: string;

  @ApiProperty({ type: String, example: 'Prefer active voice.' })
  declare body: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Rewrite passive verbs as active.',
    description: 'Optional suggested correction or null',
  })
  declare suggestedCorrection: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
    description: 'Creation timestamp (ISO)',
  })
  declare createdAt: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-05-15T10:00:00.000Z',
    description: 'Last update timestamp (ISO)',
  })
  declare updatedAt: string;
}
