import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
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
  BrandGuidelinesVersion,
  BrandGuidelinesVersionRepository,
  BrandRepository,
  ListBrandGuidelinesVersionsResult,
} from '@sfx/domain';
import type { ListBrandGuidelinesVersionsQuery } from '@sfx/validation';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../../brand/data/repositories/brand.tokens';
import { BRAND_GUIDELINES_VERSION_REPOSITORY } from '../../../brand/data/repositories/brand-guidelines.tokens';
import { assertBrandActive } from '../../../brand/application/guards/brand-exists.helper';
import {
  BrandGuidelinesVersionDto,
  BrandGuidelinesVersionsPageDto,
} from '../dto/brand-guidelines-version.dto';
import { ListBrandGuidelinesVersionsQueryPipe } from '../pipes/list-brand-guidelines-versions-query.pipe';

const DEFAULT_VERSIONS_PAGE_SIZE = 50;

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/versions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class BrandGuidelinesVersionsController {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepository: BrandRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'List brand-guidelines versions newest-first (paginated)',
    description:
      'Returns versions for the given brand ordered by `createdAt DESC, id DESC`. Use `take` (1-100, default 50) and `cursor` (opaque id of the last item on the previous page) to paginate. Unknown cursor returns 200 with an empty page (Linear/GitHub semantics).',
  })
  @ApiExtension('x-cursor-invalid-behavior', 'empty-200')
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiQuery({
    name: 'take',
    required: false,
    type: Number,
    description: 'Page size (1-100, default 50)',
    example: 50,
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Opaque cursor (id of the last item on the previous page)',
    example: 'clxbgv0001',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Optional case-insensitive substring filter on editorName/changeNote',
    example: 'rebrand',
  })
  @ApiResponse({
    status: 200,
    description: 'Page of versions newest-first',
    type: ApiEnvelopeDto(BrandGuidelinesVersionsPageDto),
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async listVersions(
    @Param('brandId') brandId: string,
    @Query(ListBrandGuidelinesVersionsQueryPipe) query: ListBrandGuidelinesVersionsQuery,
  ): Promise<ListBrandGuidelinesVersionsResult> {
    // Cursor pagination is opaque (Linear/GitHub semantics): a client
    // presenting a cursor implicitly asserts the brand existed when the
    // cursor was minted, so we trust the cursor and return what the
    // index finds (empty if the brand or cursor row is now gone). Brand
    // existence is only enforced on the unparameterised "first page"
    // request where there is no prior assertion to defer to.
    if (!query.cursor) {
      await assertBrandActive(this.brandRepository, brandId);
    }
    return this.versionRepository.list({
      brandId,
      take: query.take ?? DEFAULT_VERSIONS_PAGE_SIZE,
      cursor: query.cursor,
      q: query.q,
    });
  }

  @Get(':versionId')
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Fetch a single brand-guidelines version by id',
    description:
      'Returns the version with the given id, scoped to the brand on the path. 404 when the version does not exist or belongs to a different brand.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiParam({ name: 'versionId', type: String, description: 'Version identifier', example: 'clxbgv0001' })
  @ApiResponse({
    status: 200,
    description: 'A single version row',
    type: ApiEnvelopeDto(BrandGuidelinesVersionDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand or version not found' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async findVersionById(
    @Param('brandId') brandId: string,
    @Param('versionId') versionId: string,
  ): Promise<BrandGuidelinesVersion> {
    await assertBrandActive(this.brandRepository, brandId);
    const version = await this.versionRepository.findById(versionId);
    if (!version || version.brandId !== brandId) {
      throw new NotFoundException('Version not found');
    }
    return version;
  }
}
