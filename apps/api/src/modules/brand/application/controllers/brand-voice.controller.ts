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
  BrandVoice,
  BrandVoiceApprovedExample,
  BrandVoiceRejectedExample,
  BrandVoiceRepository,
  UpsertBrandVoiceInput,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import { zodApiBody } from '@sfx/validation';
import { upsertBrandVoiceSchema } from '@sfx/validation';
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
  BRAND_VOICE_REPOSITORY,
} from '../../data/repositories/brand-guidelines.tokens';
import { BrandVoiceDto } from '../dto/brand-voice.dto';
import { assertBrandActive } from '../guards/brand-exists.helper';
import { UpsertBrandVoicePipe } from '../pipes/upsert-brand-voice.pipe';
import { ChangeNoteQueryPipe } from '../../../brand-guidelines/application/pipes/change-note-query.pipe';

export type BrandVoiceWithVersion =
  | (BrandVoice & { latestVersionId: string | null })
  | null;

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/voice')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('accessToken')
export class BrandVoiceController {
  constructor(
    @Inject(BRAND_REPOSITORY) private readonly brandRepository: BrandRepository,
    @Inject(BRAND_VOICE_REPOSITORY) private readonly voiceRepository: BrandVoiceRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Get the Brand Voice for a brand',
    description:
      'Returns the brand voice singleton row augmented with `latestVersionId`, or `null` when no voice has been saved yet. Accepts admin OR agent role.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiResponse({
    status: 200,
    description: 'Brand Voice or null when uninitialised',
    type: ApiEnvelopeDto(BrandVoiceDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getVoice(@Param('brandId') brandId: string): Promise<BrandVoiceWithVersion> {
    await assertBrandActive(this.brandRepository, brandId);
    const [voice, latestVersion] = await Promise.all([
      this.voiceRepository.findByBrandId(brandId),
      this.versionRepository.findLatestForBrand(brandId),
    ]);
    if (!voice) return null;
    return { ...voice, latestVersionId: latestVersion?.id ?? null };
  }

  @Put()
  @AuthRoles(AUTH_ROLE_ADMIN)
  @ApiOperation({
    summary: 'Upsert the Brand Voice for a brand',
    description:
      'Creates the voice row if absent, otherwise updates it. Body is validated by Zod (`upsertBrandVoiceSchema`). Optional `?changeNote=...` query is recorded on the new BrandGuidelinesVersion row. Admin-only.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier', example: 'clxbrand0001' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row',
  })
  @ApiBody(zodApiBody(upsertBrandVoiceSchema, 'UpsertBrandVoiceInput'))
  @ApiResponse({
    status: 200,
    description: 'Persisted Brand Voice with latestVersionId',
    type: ApiEnvelopeDto(BrandVoiceDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  @ResourceCaptures({ fromPath: 'brandId', resource: 'brand', pathParam: 'brandId' })
  async putVoice(
    @Param('brandId') brandId: string,
    @Body(UpsertBrandVoicePipe) input: UpsertBrandVoiceInput,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<BrandVoice & { latestVersionId: string | null }> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    await assertBrandActive(this.brandRepository, brandId);
    const voice = await this.voiceRepository.upsertForBrand(
      brandId,
      input,
      { editorUserId: user.subject, editorDisplayName: user.email ?? user.subject },
      changeNoteQuery.changeNote ?? null,
    );
    const latestVersion = await this.versionRepository.findLatestForBrand(brandId);
    return { ...voice, latestVersionId: latestVersion?.id ?? null };
  }

  @Get('restricted-vocabulary')
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Standalone list — restricted vocabulary for a brand',
    description:
      'Returns the raw restricted-vocabulary string array. Agent-optimised — exempt from the cross-cutting `latestVersionId` envelope by design.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiResponse({
    status: 200,
    description: 'Restricted vocabulary (empty array when no voice row exists)',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getRestrictedVocabulary(
    @Param('brandId') brandId: string,
  ): Promise<readonly string[]> {
    await assertBrandActive(this.brandRepository, brandId);
    const voice = await this.voiceRepository.findByBrandId(brandId);
    return voice?.restrictedVocabulary ?? [];
  }

  @Get('approved-examples')
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Standalone list — approved-example phrases for a brand',
    description:
      'Returns the raw approved-example phrase list. Agent-optimised — exempt from the cross-cutting `latestVersionId` envelope by design.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiResponse({ status: 200, description: 'Approved-example phrases (empty array when none)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getApprovedExamples(
    @Param('brandId') brandId: string,
  ): Promise<readonly BrandVoiceApprovedExample[]> {
    await assertBrandActive(this.brandRepository, brandId);
    const voice = await this.voiceRepository.findByBrandId(brandId);
    return voice?.approvedExamples ?? [];
  }

  @Get('rejected-examples')
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'Standalone list — rejected-example phrases for a brand',
    description:
      'Returns the raw rejected-example phrase list. Agent-optimised — exempt from the cross-cutting `latestVersionId` envelope by design.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiResponse({ status: 200, description: 'Rejected-example phrases (empty array when none)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async getRejectedExamples(
    @Param('brandId') brandId: string,
  ): Promise<readonly BrandVoiceRejectedExample[]> {
    await assertBrandActive(this.brandRepository, brandId);
    const voice = await this.voiceRepository.findByBrandId(brandId);
    return voice?.rejectedExamples ?? [];
  }
}
