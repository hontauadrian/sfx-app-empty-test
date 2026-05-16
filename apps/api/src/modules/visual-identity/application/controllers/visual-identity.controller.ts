import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  BRAND_PROFILE_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
  type IBrandProfileRepository,
  type IVisualIdentityRepository,
  type VisualIdentity,
  type VisualIdentityColourPaletteEntry,
  type VisualIdentityTypographyRule,
  type VisualIdentityWritePayload,
} from '@sfx/domain';
import {
  visualIdentityWriteSchema,
  type VisualIdentityWriteInput,
} from '@sfx/validation';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest } from '../../../auth/application/types/authenticated-request';
import { VisualIdentityDto } from '../dto/visual-identity.dto';
import { VisualIdentityWriteDto } from '../dto/visual-identity-write.dto';
import { VisualIdentityEnvelopeDto } from '../dto/visual-identity-envelope.dto';
import { VisualIdentityColourPaletteEntryDto } from '../dto/visual-identity-colour-palette-entry.dto';
import { VisualIdentityTypographyRuleDto } from '../dto/visual-identity-typography-rule.dto';

function paletteToDto(
  entries: readonly VisualIdentityColourPaletteEntry[],
): readonly VisualIdentityColourPaletteEntryDto[] {
  return entries.map((entry) => ({
    name: entry.name,
    hex: entry.hex,
    usage: entry.usage,
  })) as readonly VisualIdentityColourPaletteEntryDto[];
}

function typographyToDto(
  entries: readonly VisualIdentityTypographyRule[],
): readonly VisualIdentityTypographyRuleDto[] {
  return entries.map((entry) => ({
    role: entry.role,
    family: entry.family,
    weight: entry.weight,
    size: entry.size,
    notes: entry.notes,
  })) as readonly VisualIdentityTypographyRuleDto[];
}

function toDto(identity: VisualIdentity, brandFallbackIso: string): VisualIdentityDto {
  return {
    id: identity.id,
    brandId: identity.brandId,
    logoUsageRules: identity.logoUsageRules,
    colourPalette: paletteToDto(identity.colourPalette),
    typographyRules: typographyToDto(identity.typographyRules),
    spacingLayoutGuidance: identity.spacingLayoutGuidance,
    imageStyleGuidance: identity.imageStyleGuidance,
    iconographyGuidance: identity.iconographyGuidance,
    usageRestrictions: identity.usageRestrictions,
    createdAt: identity.createdAt ? identity.createdAt.toISOString() : brandFallbackIso,
    updatedAt: identity.updatedAt ? identity.updatedAt.toISOString() : brandFallbackIso,
  };
}

function emptyDto(brandId: string, brandUpdatedAtIso: string): VisualIdentityDto {
  return {
    id: '',
    brandId,
    logoUsageRules: null,
    colourPalette: [],
    typographyRules: [],
    spacingLayoutGuidance: null,
    imageStyleGuidance: null,
    iconographyGuidance: null,
    usageRestrictions: null,
    createdAt: brandUpdatedAtIso,
    updatedAt: brandUpdatedAtIso,
  };
}

function normalisePayload(body: VisualIdentityWriteInput): VisualIdentityWritePayload {
  return {
    logoUsageRules: body.logoUsageRules,
    colourPalette: body.colourPalette.map((entry) => ({
      name: entry.name,
      hex: entry.hex,
      usage: entry.usage,
    })),
    typographyRules: body.typographyRules.map((entry) => ({
      role: entry.role,
      family: entry.family,
      weight: entry.weight,
      size: entry.size,
      notes: entry.notes,
    })),
    spacingLayoutGuidance: body.spacingLayoutGuidance,
    imageStyleGuidance: body.imageStyleGuidance,
    iconographyGuidance: body.iconographyGuidance,
    usageRestrictions: body.usageRestrictions,
  };
}

@ApiTags('visual-identity')
@Controller('brands/:brandId/visual-identity')
export class VisualIdentityController {
  constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepository: IBrandProfileRepository,
    @Inject(VISUAL_IDENTITY_REPOSITORY)
    private readonly visualIdentityRepository: IVisualIdentityRepository,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get the visual identity for the authenticated caller' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Visual identity (or empty defaults when no row exists yet)',
    type: VisualIdentityEnvelopeDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async getVisualIdentity(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
  ): Promise<VisualIdentityDto> {
    const brand = await this.brandProfileRepository.findById(brandId, request.user.subject);
    if (!brand) throw new NotFoundException('Brand not found');
    const identity = await this.visualIdentityRepository.findByBrand(
      brandId,
      request.user.subject,
    );
    const fallbackIso = brand.updatedAt.toISOString();
    return identity ? toDto(identity, fallbackIso) : emptyDto(brandId, fallbackIso);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Upsert the visual identity for the authenticated caller' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiBody({
    type: VisualIdentityWriteDto,
    examples: {
      empty: { summary: 'Empty / clear', value: {} },
      populated: {
        summary: 'Populated',
        value: {
          logoUsageRules: 'Maintain clear space.',
          spacingLayoutGuidance: 'Use an 8px baseline grid.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Visual identity upserted',
    type: VisualIdentityEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async upsertVisualIdentity(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Body(new ZodValidationPipe(visualIdentityWriteSchema))
    body: VisualIdentityWriteInput,
  ): Promise<VisualIdentityDto> {
    const brand = await this.brandProfileRepository.findById(brandId, request.user.subject);
    if (!brand) throw new NotFoundException('Brand not found');
    const payload = normalisePayload(body);
    const upserted = await this.visualIdentityRepository.upsertForBrand(
      brandId,
      request.user.subject,
      payload,
    );
    if (!upserted) throw new NotFoundException('Brand not found');
    return toDto(upserted, brand.updatedAt.toISOString());
  }
}
