import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AgentAuditLog,
  AgentAuditLogRepository,
  BrandRepository,
  ListAgentAuditLogsResult,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN } from '@sfx/shared';
import type { ListAgentAuditLogQuery } from '@sfx/validation';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../../brand/data/repositories/brand.tokens';
import { assertBrandActive } from '../../../brand/application/guards/brand-exists.helper';
import { AGENT_AUDIT_LOG_REPOSITORY } from '../../data/repositories/agent-audit-log.tokens';
import { AgentAuditLogListDto } from '../dto/agent-audit-log.dto';
import { ListAgentAuditLogQueryPipe } from '../pipes/list-agent-audit-log-query.pipe';

const DEFAULT_AUDIT_LOG_TAKE = 50;

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/agent-audit-log')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class AgentAuditLogController {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: BrandRepository,
    @Inject(AGENT_AUDIT_LOG_REPOSITORY)
    private readonly repository: AgentAuditLogRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN)
  @ApiOperation({
    summary: 'List agent-authenticated requests recorded against a brand',
    description:
      'Returns newest-first agent-audit-log rows for the brand on the path. Admin-only. Optional `clientId` substring filter and ISO-8601 `from`/`to` date-range narrow results.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiQuery({
    name: 'clientId',
    required: false,
    type: String,
    description: 'Case-insensitive substring filter on the audit row clientId column',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Case-insensitive substring filter applied across clientId AND endpointPath',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'Lower bound (inclusive) for requestTimestamp, ISO-8601',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description: 'Upper bound (inclusive) for requestTimestamp, ISO-8601',
  })
  @ApiQuery({
    name: 'take',
    required: false,
    type: Number,
    description: 'Page size (1-200, default 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Newest-first agent-audit-log rows',
    type: ApiEnvelopeDto(AgentAuditLogListDto),
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async listAuditLog(
    @Param('brandId') brandId: string,
    @Query(ListAgentAuditLogQueryPipe) query: ListAgentAuditLogQuery,
  ): Promise<{ items: readonly AgentAuditLog[] }> {
    await assertBrandActive(this.brandRepository, brandId);
    const result: ListAgentAuditLogsResult = await this.repository.list({
      brandId,
      clientId: query.clientId,
      q: query.q,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      take: query.take ?? DEFAULT_AUDIT_LOG_TAKE,
    });
    return { items: result.items };
  }
}
