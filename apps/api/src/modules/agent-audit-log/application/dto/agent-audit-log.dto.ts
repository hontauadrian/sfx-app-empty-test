import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentAuditLogDto {
  @ApiProperty({ type: String, description: 'Audit row identifier', example: 'aud-1' })
  declare id: string;

  @ApiProperty({
    type: String,
    description: 'Correlation request id (sourced from x-request-id when present)',
    example: 'req-abc',
  })
  declare requestId: string;

  @ApiProperty({
    type: String,
    description: 'Keycloak client_id that issued the agent token',
    example: 'brand-reader-agent-001',
  })
  declare clientId: string;

  @ApiProperty({
    type: String,
    description: 'Request path that produced this row',
    example: '/api/v1/brands/brand-1/guidelines/voice',
  })
  declare endpointPath: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Brand id when the request was path-scoped to a brand, else null',
  })
  declare brandId: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'BrandGuidelinesVersion id surfaced in the response, when applicable',
  })
  declare versionIdReturned: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Request arrival timestamp',
  })
  declare requestTimestamp: Date;

  @ApiProperty({ type: Number, description: 'HTTP status that was returned', example: 200 })
  declare responseStatus: number;
}

export class AgentAuditLogListDto {
  @ApiProperty({
    type: [AgentAuditLogDto],
    isArray: true,
    description: 'Audit rows newest-first',
  })
  declare items: readonly AgentAuditLogDto[];
}
