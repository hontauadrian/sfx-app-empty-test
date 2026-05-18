import { ApiProperty } from '@nestjs/swagger';

export class BrandMetadataDto {
  @ApiProperty({ type: String, description: 'Owning brand id', example: 'clxbrand0001' })
  declare brandId: string;

  @ApiProperty({ type: String, description: 'Subject id of the brand owner', example: 'subject-admin' })
  declare ownerUserId: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Timestamp of the last admin save' })
  declare lastUpdatedAt: Date;

  @ApiProperty({
    type: String,
    description: 'Subject id of the admin that last PUT metadata',
    example: 'subject-admin',
  })
  declare lastUpdatedByUserId: string;

  @ApiProperty({
    type: [String],
    isArray: true,
    description: 'Free-form metadata tags',
    example: ['campaign-spring'],
  })
  declare tags: readonly string[];

  @ApiProperty({ type: String, format: 'date-time', description: 'Record creation timestamp' })
  declare createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record last-update timestamp' })
  declare updatedAt: Date;
}
