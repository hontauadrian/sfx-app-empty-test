import {
  Body,
  Controller,
  Get,
  HttpCode,
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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  BrandGuidelinesVersionRepository,
  BrandMetadata,
  BrandMetadataRepository,
  BrandRepository,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import {
  brandMetadataResponseSchema,
  upsertBrandMetadataSchema,
  zodApiBody,
  zodToOpenApi,
} from '@sfx/validation';
import type { ChangeNoteQuery, UpsertBrandMetadataBody } from '@sfx/validation';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import {
  JwtAuthGuard,
  type RequestWithAuthenticatedUser,
} from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../../brand/data/repositories/brand.tokens';
import { BRAND_GUIDELINES_VERSION_REPOSITORY } from '../../../brand/data/repositories/brand-guidelines.tokens';
import { BRAND_METADATA_REPOSITORY } from '../../data/repositories/brand-guidelines.tokens';
import { ChangeNoteQueryPipe } from '../pipes/change-note-query.pipe';
import { UpsertBrandMetadataPipe } from '../pipes/upsert-brand-metadata.pipe';
import { BrandMetadataDto } from '../dto/brand-metadata.dto';

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/metadata')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiBearerAuth('accessToken')
export class BrandMetadataController {
  constructor(
    @Inject(BRAND_METADATA_REPOSITORY)
    private readonly repository: BrandMetadataRepository,
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: BrandRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get brand metadata (auto-creates empty singleton)',
    description:
      'Returns the brand\'s metadata singleton. If the row does not exist yet, this endpoint upserts an empty record with `tags: []` so callers always receive a real record.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiResponse({
    status: 200,
    description: 'Brand metadata wrapped in the standard envelope',
    schema: zodToOpenApi(brandMetadataResponseSchema, { ref: 'BrandMetadata' }) as never,
    type: BrandMetadataDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getMetadata(
    @Param('brandId') brandId: string,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<BrandMetadata & { latestVersionId: string | null }> {
    if (!req.user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    const brand = await this.brandRepository.findActiveById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    const existing = await this.repository.findByBrandId(brandId);
    const metadata =
      existing ??
      (await this.repository.upsertByBrandId(
        brandId,
        {},
        { editorUserId: req.user.subject, ownerUserId: brand.ownerUserId },
        null,
      ));
    const latestVersion = await this.versionRepository.findLatestForBrand(brandId);
    return { ...metadata, latestVersionId: latestVersion?.id ?? null };
  }

  @Put()
  @AuthRoles(AUTH_ROLE_ADMIN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Upsert brand metadata',
    description: 'Upserts the brand metadata singleton. Stamps `lastUpdatedAt` and `lastUpdatedByUserId` on every call.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row',
  })
  @ApiBody({
    ...zodApiBody(upsertBrandMetadataSchema, 'UpsertBrandMetadataInput'),
    examples: {
      default: {
        summary: 'Standard upsert with tags',
        value: { tags: ['campaign-spring', 'EN'] },
      },
      clear: {
        summary: 'Clear all tags',
        value: { tags: [] },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Persisted metadata singleton',
    schema: zodToOpenApi(brandMetadataResponseSchema, { ref: 'BrandMetadata' }) as never,
    type: BrandMetadataDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async upsertMetadata(
    @Param('brandId') brandId: string,
    @Body(UpsertBrandMetadataPipe) input: UpsertBrandMetadataBody,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<BrandMetadata & { latestVersionId: string | null }> {
    if (!req.user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    const brand = await this.brandRepository.findActiveById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    const metadata = await this.repository.upsertByBrandId(
      brandId,
      input,
      { editorUserId: req.user.subject, ownerUserId: brand.ownerUserId },
      changeNoteQuery.changeNote ?? null,
    );
    const latestVersion = await this.versionRepository.findLatestForBrand(brandId);
    return { ...metadata, latestVersionId: latestVersion?.id ?? null };
  }
}
