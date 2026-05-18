import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  CompanyInfo,
  CompanyInfoRepository,
  CompanyInfoVersion,
  ListCompanyInfoVersionsResult,
  UpsertCompanyInfoInput,
} from '@sfx/domain';
import type { ListCompanyInfoVersionsQuery } from '@sfx/validation';
import { AUTH_ROLE_ADMIN } from '@sfx/shared';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import {
  JwtAuthGuard,
  type RequestWithAuthenticatedUser,
} from '../../../../common/guards/jwt-auth.guard';
import { COMPANY_INFO_REPOSITORY } from '../../data/repositories/company-info.tokens';
import { CompanyInfoDto } from '../dto/company-info.dto';
import {
  CompanyInfoVersionDto,
  CompanyInfoVersionsPageDto,
} from '../dto/company-info-version.dto';
import { ListCompanyInfoVersionsQueryPipe } from '../pipes/list-company-info-versions-query.pipe';
import { UpsertCompanyInfoPipe } from '../pipes/upsert-company-info.pipe';

const DEFAULT_VERSIONS_PAGE_SIZE = 50;

@ApiTags('company-info')
@Controller('company-info')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiBearerAuth('accessToken')
export class CompanyInfoController {
  constructor(
    @Inject(COMPANY_INFO_REPOSITORY)
    private readonly repository: CompanyInfoRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get the singleton company info record',
    description: 'Returns the persisted company info record, or `null` when no record has been created yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Singleton record or null when uninitialised',
    type: ApiEnvelopeDto(CompanyInfoDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    return this.repository.findSingleton();
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert the singleton company info record (creates a version row in the same transaction)',
    description: 'Creates the company info record if absent, otherwise updates the existing one. Every PUT writes a CompanyInfoVersion row in the same Prisma `$transaction`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Persisted record after upsert',
    type: ApiEnvelopeDto(CompanyInfoDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ResourceCaptures({ fromPath: 'id', resource: 'companyInfo', pathParam: 'id' })
  async upsertCompanyInfo(
    @Body(UpsertCompanyInfoPipe) input: UpsertCompanyInfoInput,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<CompanyInfo> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    return this.repository.upsertSingleton(input, {
      editorUserId: user.subject,
      editorDisplayName: user.email ?? user.subject,
    });
  }

  @Get('versions')
  @ApiOperation({
    summary: 'List CompanyInfo versions newest-first (paginated)',
    description: 'Returns versions ordered by `createdAt DESC, id DESC`. Use `take` (1-100, default 50) and `cursor` (opaque id of the last item on the previous page) to paginate. Unknown cursor returns 200 with an empty page (Linear/GitHub semantics per spec A6).',
  })
  @ApiExtension('x-cursor-invalid-behavior', 'empty-200')
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Page size (1-100, default 50)' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor (id of the last item on the previous page)' })
  @ApiResponse({
    status: 200,
    description: 'Page of versions',
    type: ApiEnvelopeDto(CompanyInfoVersionsPageDto),
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  async listVersions(
    @Query(ListCompanyInfoVersionsQueryPipe) query: ListCompanyInfoVersionsQuery,
  ): Promise<ListCompanyInfoVersionsResult> {
    return this.repository.listVersions({
      take: query.take ?? DEFAULT_VERSIONS_PAGE_SIZE,
      cursor: query.cursor,
    });
  }

  @Get('versions/:id')
  @ApiOperation({
    summary: 'Fetch a single CompanyInfo version by id',
    description: 'Returns the version with the given id, or 404 if no version with that id exists.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Version identifier' })
  @ApiResponse({
    status: 200,
    description: 'Version record',
    type: ApiEnvelopeDto(CompanyInfoVersionDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async findVersionById(@Param('id') id: string): Promise<CompanyInfoVersion> {
    const version = await this.repository.findVersionById(id);
    if (!version) {
      throw new NotFoundException('Version not found');
    }
    return version;
  }
}
