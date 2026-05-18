import {
  Body,
  Controller,
  Get,
  Inject,
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
  BrandRepository,
  UpsertVisualIdentityInput,
  VisualIdentity,
  VisualIdentityRepository,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import { zodApiBody, upsertVisualIdentitySchema } from '@sfx/validation';
import type { ChangeNoteQuery } from '@sfx/validation';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import {
  JwtAuthGuard,
  type RequestWithAuthenticatedUser,
} from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../data/repositories/brand.tokens';
import {
  BRAND_GUIDELINES_VERSION_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
} from '../../data/repositories/brand-guidelines.tokens';
import { VisualIdentityDto } from '../dto/visual-identity.dto';
import { assertBrandActive } from '../guards/brand-exists.helper';
import { UpsertVisualIdentityPipe } from '../pipes/upsert-visual-identity.pipe';
import { ChangeNoteQueryPipe } from '../../../brand-guidelines/application/pipes/change-note-query.pipe';

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/visual')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class VisualIdentityController {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepository: BrandRepository,
    @Inject(VISUAL_IDENTITY_REPOSITORY)
    private readonly visualRepository: VisualIdentityRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Get the Visual Identity for a brand',
    description:
      'Returns the visual identity singleton row, or `null` when no visual identity has been saved yet. Accepts admin OR agent role.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiResponse({
    status: 200,
    description: 'Visual Identity or null when uninitialised',
    type: ApiEnvelopeDto(VisualIdentityDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getVisual(
    @Param('brandId') brandId: string,
  ): Promise<(VisualIdentity & { latestVersionId: string | null }) | null> {
    await assertBrandActive(this.brandRepository, brandId);
    const [visual, latestVersion] = await Promise.all([
      this.visualRepository.findByBrandId(brandId),
      this.versionRepository.findLatestForBrand(brandId),
    ]);
    if (!visual) return null;
    return { ...visual, latestVersionId: latestVersion?.id ?? null };
  }

  @Put()
  @AuthRoles(AUTH_ROLE_ADMIN)
  @ApiOperation({
    summary: 'Upsert the Visual Identity for a brand',
    description:
      'Creates the visual identity row if absent, otherwise updates it. Body is validated by Zod (`upsertVisualIdentitySchema`). Returns the persisted entity. Admin-only.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row',
  })
  @ApiBody(zodApiBody(upsertVisualIdentitySchema, 'UpsertVisualIdentityInput'))
  @ApiResponse({
    status: 200,
    description: 'Persisted Visual Identity with latestVersionId',
    type: ApiEnvelopeDto(VisualIdentityDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async putVisual(
    @Param('brandId') brandId: string,
    @Body(UpsertVisualIdentityPipe) input: UpsertVisualIdentityInput,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<VisualIdentity & { latestVersionId: string | null }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    await assertBrandActive(this.brandRepository, brandId);
    const visual = await this.visualRepository.upsertForBrand(
      brandId,
      input,
      { editorUserId: user.subject, editorDisplayName: user.email ?? user.subject },
      changeNoteQuery.changeNote ?? null,
    );
    const latestVersion = await this.versionRepository.findLatestForBrand(brandId);
    return { ...visual, latestVersionId: latestVersion?.id ?? null };
  }
}
