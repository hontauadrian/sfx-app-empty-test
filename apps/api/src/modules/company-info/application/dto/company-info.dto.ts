import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyInfoDto {
  @ApiProperty({ type: String, description: 'Unique company info record identifier', example: 'clxyz1234567890' })
  declare id: string;

  @ApiProperty({ type: String, description: 'Registered legal name', example: 'Acme Holdings SRL' })
  declare legalName: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Trading name', example: 'Acme' })
  declare tradingName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'email', description: 'Contact email address', example: 'hello@acme.example' })
  declare email: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Contact phone number', example: '+40 21 555 0000' })
  declare phone: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Website URL', example: 'https://acme.example' })
  declare website: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Address line 1' })
  declare addressLine1: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Address line 2' })
  declare addressLine2: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'City' })
  declare city: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Postal code' })
  declare postalCode: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Country (ISO 3166 country name)' })
  declare country: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Tax identifier' })
  declare taxId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Company registration number' })
  declare registrationNumber: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Company display name', example: 'Acme' })
  declare companyName: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Year the company was founded', example: 1998 })
  declare foundedYear: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Approximate headcount', example: 42 })
  declare teamSize: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Industry', example: 'Manufacturing' })
  declare industry: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Mission statement', example: 'To delight customers.' })
  declare missionStatement: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Vision statement', example: 'To be the most trusted brand.' })
  declare visionStatement: string | null;

  @ApiProperty({ type: [String], isArray: true, description: 'Repeatable list of core values', example: ['Integrity', 'Craft'] })
  declare coreValues: readonly string[];

  @ApiProperty({ type: [String], isArray: true, description: 'Repeatable list of certifications', example: ['ISO 9001', 'SOC 2'] })
  declare certifications: readonly string[];

  @ApiProperty({ type: String, format: 'date-time', description: 'Record creation timestamp' })
  declare createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Record last-update timestamp' })
  declare updatedAt: Date;
}
