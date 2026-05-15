import { ApiProperty } from '@nestjs/swagger';

export class BrandProfileDto {
  @ApiProperty({ type: String, example: 'cuid12345' })
  declare id: string;

  @ApiProperty({ type: String, example: 'sub-keycloak-1' })
  declare ownerSubject: string;

  @ApiProperty({ type: String, example: 'Acme Brand' })
  declare name: string;

  @ApiProperty({ type: String, nullable: true, example: 'A short summary of the brand' })
  declare description: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-05-15T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-05-15T10:00:00.000Z' })
  declare updatedAt: string;
}
