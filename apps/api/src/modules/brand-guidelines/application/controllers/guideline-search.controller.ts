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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  BrandRepository,
  GuidelineSearchRepository,
  GuidelineSearchResult,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import {
  guidelineSearchResponseSchema,
  zodToOpenApi,
} from '@sfx/validation';
import type { GuidelineSearchQuery } from '@sfx/validation';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../../brand/data/repositories/brand.tokens';
import { GUIDELINE_SEARCH_REPOSITORY } from '../../data/repositories/brand-guidelines.tokens';
import { GuidelineSearchQueryPipe } from '../pipes/guideline-search-query.pipe';
import { GuidelineSearchResponseDto } from '../dto/guideline-search.dto';

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/search')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
@ApiBearerAuth('accessToken')
export class GuidelineSearchController {
  constructor(
    @Inject(GUIDELINE_SEARCH_REPOSITORY)
    private readonly repository: GuidelineSearchRepository,
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: BrandRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search the active brand\'s guideline corpus',
    description:
      'Substring (ILIKE) search across Dos & Don\'ts, Metadata, Brand Voice, and Visual Identity scoped to the path-bound brand. Results are grouped by source section. Empty `q` returns an empty groups list without hitting the DB.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Search query (max 200 chars)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results grouped by source section',
    schema: zodToOpenApi(guidelineSearchResponseSchema, { ref: 'GuidelineSearchResponse' }) as never,
    type: GuidelineSearchResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async search(
    @Param('brandId') brandId: string,
    @Query(GuidelineSearchQueryPipe) query: GuidelineSearchQuery,
  ): Promise<GuidelineSearchResult> {
    const brand = await this.brandRepository.findActiveById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return this.repository.searchByBrand({ brandId, query: query.q ?? '' });
  }
}
