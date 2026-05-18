import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrandDto {
  @ApiProperty({ type: String, description: 'Brand identifier', example: 'clxyzbrand0000000001' })
  declare id: string;

  @ApiProperty({ type: String, description: 'Display name', example: 'Acme Holdings' })
  declare name: string;

  @ApiProperty({ type: String, description: 'URL-safe slug (server-derived from name)', example: 'acme-holdings' })
  declare slug: string;

  @ApiProperty({ type: String, description: 'Stable subject id of the admin that created the brand', example: 'subject-admin' })
  declare ownerUserId: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record creation timestamp' })
  declare createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record last-update timestamp' })
  declare updatedAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, description: 'Soft-delete timestamp; null when active' })
  declare deletedAt: Date | null;
}

export class BrandsListDto {
  @ApiProperty({ type: [BrandDto], isArray: true, description: 'Active brand profiles, newest-first' })
  declare brands: readonly BrandDto[];
}
