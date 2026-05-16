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
  BRAND_VOICE_REPOSITORY,
  type AudienceRule,
  type BrandVoice,
  type BrandVoiceUpsertInput,
  type IBrandProfileRepository,
  type IBrandVoiceRepository,
} from '@sfx/domain';
import { brandVoiceWriteSchema, type BrandVoiceWriteInput } from '@sfx/validation';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest } from '../../../auth/application/types/authenticated-request';
import { AudienceRuleDto } from '../dto/audience-rule.dto';
import { BrandVoiceDto } from '../dto/brand-voice.dto';
import { BrandVoiceEnvelopeDto } from '../dto/brand-voice-envelope.dto';
import { BrandVoiceWriteDto } from '../dto/brand-voice-write.dto';

function toDto(voice: BrandVoice): BrandVoiceDto {
  return {
    brandProfileId: voice.brandProfileId,
    toneOfVoice: voice.toneOfVoice,
    preferredVocabulary: [...voice.preferredVocabulary],
    restrictedVocabulary: [...voice.restrictedVocabulary],
    messagingPillars: [...voice.messagingPillars],
    writingStyleRules: [...voice.writingStyleRules],
    audienceRules: voice.audienceRules.map((entry) => ({
      audience: entry.audience,
      rule: entry.rule,
    })) as readonly AudienceRuleDto[],
    approvedExamplePhrases: [...voice.approvedExamplePhrases],
    rejectedExamplePhrases: [...voice.rejectedExamplePhrases],
    createdAt: voice.createdAt ? voice.createdAt.toISOString() : null,
    updatedAt: voice.updatedAt ? voice.updatedAt.toISOString() : null,
  };
}

function emptyDto(brandProfileId: string): BrandVoiceDto {
  return {
    brandProfileId,
    toneOfVoice: null,
    preferredVocabulary: [],
    restrictedVocabulary: [],
    messagingPillars: [],
    writingStyleRules: [],
    audienceRules: [],
    approvedExamplePhrases: [],
    rejectedExamplePhrases: [],
    createdAt: null,
    updatedAt: null,
  };
}

function normalisePayload(body: BrandVoiceWriteInput): BrandVoiceUpsertInput {
  const toneOfVoice =
    typeof body.toneOfVoice === 'string' && body.toneOfVoice.length === 0
      ? null
      : (body.toneOfVoice ?? null);
  const audienceRules: AudienceRule[] = (body.audienceRules ?? []).map((entry) => ({
    audience: entry.audience,
    rule: entry.rule,
  }));
  return {
    toneOfVoice,
    preferredVocabulary: body.preferredVocabulary ?? [],
    restrictedVocabulary: body.restrictedVocabulary ?? [],
    messagingPillars: body.messagingPillars ?? [],
    writingStyleRules: body.writingStyleRules ?? [],
    audienceRules,
    approvedExamplePhrases: body.approvedExamplePhrases ?? [],
    rejectedExamplePhrases: body.rejectedExamplePhrases ?? [],
  };
}

@ApiTags('brand-voice')
@Controller('brands/:id/voice')
export class BrandVoiceController {
  constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepository: IBrandProfileRepository,
    @Inject(BRAND_VOICE_REPOSITORY)
    private readonly brandVoiceRepository: IBrandVoiceRepository,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get the brand voice for the authenticated caller' })
  @ApiParam({ name: 'id', type: String, example: 'cuid12345', description: 'Brand identifier' })
  @ApiResponse({
    status: 200,
    description: 'Brand voice (or empty defaults when no row exists yet)',
    type: BrandVoiceEnvelopeDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async getVoice(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<BrandVoiceDto> {
    const brand = await this.brandProfileRepository.findById(id, request.user.subject);
    if (!brand) throw new NotFoundException('Brand not found');
    const voice = await this.brandVoiceRepository.findByBrand(id, request.user.subject);
    return voice ? toDto(voice) : emptyDto(id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Upsert the brand voice for the authenticated caller' })
  @ApiParam({ name: 'id', type: String, example: 'cuid12345', description: 'Brand identifier' })
  @ApiBody({
    type: BrandVoiceWriteDto,
    examples: {
      empty: { summary: 'Empty / clear', value: {} },
      populated: {
        summary: 'Populated',
        value: {
          toneOfVoice: 'Warm, direct, plain-spoken.',
          preferredVocabulary: ['craft', 'trust'],
          restrictedVocabulary: ['utilize'],
          messagingPillars: ['Trust', 'Craft'],
          writingStyleRules: ['Use active voice.'],
          audienceRules: [{ audience: 'Gen Z', rule: 'Speak peer-to-peer.' }],
          approvedExamplePhrases: ['We build with care.'],
          rejectedExamplePhrases: ['Synergize value-add.'],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Brand voice upserted',
    type: BrandVoiceEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async upsertVoice(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(brandVoiceWriteSchema))
    body: BrandVoiceWriteInput,
  ): Promise<BrandVoiceDto> {
    const payload = normalisePayload(body);
    const upserted = await this.brandVoiceRepository.upsertForBrand(
      id,
      request.user.subject,
      payload,
    );
    if (!upserted) throw new NotFoundException('Brand not found');
    return toDto(upserted);
  }
}
