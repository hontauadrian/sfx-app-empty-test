import { ApiProperty } from '@nestjs/swagger';
import { CompanyInfoDto } from './company-info.dto';

export class CompanyInfoVersionDto {
  @ApiProperty({ type: String, description: 'Version identifier', example: 'clxyzversion0000000001' })
  declare id: string;

  @ApiProperty({
    type: String,
    description: 'Identifier of the CompanyInfo record this version belongs to',
    example: 'clxyz1234567890',
  })
  declare companyInfoId: string;

  @ApiProperty({
    type: CompanyInfoDto,
    description: 'Full CompanyInfo snapshot at the time the version was created',
  })
  declare snapshot: CompanyInfoDto;

  @ApiProperty({
    type: String,
    description: 'Stable subject identifier of the user that saved this version',
    example: 'auth-user-abc',
  })
  declare editorUserId: string;

  @ApiProperty({
    type: String,
    description: 'Human-readable display name of the editor (email or username)',
    example: 'admin@example.com',
  })
  declare editorDisplayName: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Version creation timestamp' })
  declare createdAt: Date;
}

export class CompanyInfoVersionsPageDto {
  @ApiProperty({
    type: [CompanyInfoVersionDto],
    isArray: true,
    description: 'Versions newest-first',
  })
  declare items: readonly CompanyInfoVersionDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor for the next page, or null when no further pages exist',
  })
  declare nextCursor: string | null;
}
