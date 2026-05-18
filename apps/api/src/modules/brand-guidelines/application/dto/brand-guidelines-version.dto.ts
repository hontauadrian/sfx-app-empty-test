import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrandVoiceDto } from '../../../brand/application/dto/brand-voice.dto';
import { VisualIdentityDto } from '../../../brand/application/dto/visual-identity.dto';
import { DosDontsEntryDto } from './dos-and-donts.dto';
import { BrandMetadataDto } from './brand-metadata.dto';

export class BrandGuidelinesSnapshotDto {
  @ApiPropertyOptional({
    type: BrandVoiceDto,
    nullable: true,
    description: 'Brand Voice snapshot or null when no voice row existed at save time',
  })
  declare voice: BrandVoiceDto | null;

  @ApiPropertyOptional({
    type: VisualIdentityDto,
    nullable: true,
    description: 'Visual Identity snapshot or null when no visual identity existed at save time',
  })
  declare visual: VisualIdentityDto | null;

  @ApiProperty({
    type: [DosDontsEntryDto],
    isArray: true,
    description: 'Dos & Donts entries newest-first at save time',
  })
  declare dosAndDonts: readonly DosDontsEntryDto[];

  @ApiPropertyOptional({
    type: BrandMetadataDto,
    nullable: true,
    description: 'Brand metadata snapshot or null when no metadata existed at save time',
  })
  declare metadata: BrandMetadataDto | null;
}

export class BrandGuidelinesVersionDto {
  @ApiProperty({ type: String, description: 'Version identifier', example: 'clxbgv0001' })
  declare id: string;

  @ApiProperty({ type: String, description: 'Owning brand identifier', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({
    type: BrandGuidelinesSnapshotDto,
    description: 'Full four-section guideline snapshot at the time the version was saved',
  })
  declare snapshot: BrandGuidelinesSnapshotDto;

  @ApiProperty({
    type: String,
    description: 'Auth subject id of the editor that produced this version',
    example: 'auth-user-abc',
  })
  declare editorUserId: string;

  @ApiProperty({
    type: String,
    description: 'Editor display name (email or username)',
    example: 'admin@example.com',
  })
  declare editorDisplayName: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional change note supplied by the editor (max 500 chars)',
    example: 'tone tightening',
  })
  declare changeNote: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Version creation timestamp',
  })
  declare createdAt: Date;
}

export class BrandGuidelinesVersionsPageDto {
  @ApiProperty({
    type: [BrandGuidelinesVersionDto],
    isArray: true,
    description: 'Versions newest-first',
  })
  declare items: readonly BrandGuidelinesVersionDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Cursor for the next page, or null when no further pages exist',
    example: 'clxbgv0010',
  })
  declare nextCursor: string | null;
}
