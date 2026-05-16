import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
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
  type BrandProfile,
  type IBrandProfileRepository,
} from '@sfx/domain';
import { brandProfileWriteSchema, type BrandProfileWriteInput } from '@sfx/validation';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest } from '../../../auth/application/types/authenticated-request';
import { BrandProfileDto } from '../dto/brand-profile.dto';
import { BrandProfileListEnvelopeDto } from '../dto/brand-profile-list-envelope.dto';
import { BrandProfileWriteDto } from '../dto/brand-profile-write.dto';

function toDto(brand: BrandProfile): BrandProfileDto {
  return {
    id: brand.id,
    ownerSubject: brand.ownerSubject,
    name: brand.name,
    description: brand.description,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

@ApiTags('brand-profile')
@Controller('brands')
export class BrandProfileController {
  constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly repository: IBrandProfileRepository,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List brands owned by the authenticated caller' })
  @ApiResponse({
    status: 200,
    description: 'Brands owned by the caller, ordered by updatedAt DESC',
    type: BrandProfileListEnvelopeDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async list(@Req() request: AuthenticatedRequest): Promise<BrandProfileDto[]> {
    const brands = await this.repository.listByOwner(request.user.subject);
    return brands.map(toDto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ResourceCaptures(
    { fromPath: 'id', resource: 'brandProfile', pathParam: 'id' },
    { fromPath: 'id', resource: 'brandProfile', pathParam: 'brandId' },
  )
  @ApiOperation({ summary: 'Create a brand owned by the authenticated caller' })
  @ApiBody({
    type: BrandProfileWriteDto,
    examples: {
      minimal: { summary: 'Minimal', value: { name: 'Acme Brand' } },
      withDescription: {
        summary: 'With description',
        value: { name: 'Acme Brand', description: 'A short summary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Brand created', type: ApiEnvelopeDto(BrandProfileDto) })
  @ApiResponse({ status: 400, description: 'Validation failed (name empty or too long)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(brandProfileWriteSchema)) body: BrandProfileWriteInput,
  ): Promise<BrandProfileDto> {
    const created = await this.repository.create({
      ownerSubject: request.user.subject,
      name: body.name,
      description: body.description ?? null,
    });
    return toDto(created);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiParam({ name: 'id', type: String, example: 'cuid12345', description: 'Brand identifier' })
  @ApiOperation({ summary: 'Get a brand owned by the authenticated caller' })
  @ApiResponse({
    status: 200,
    description: 'Brand found',
    type: ApiEnvelopeDto(BrandProfileDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async findById(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<BrandProfileDto> {
    const brand = await this.repository.findById(id, request.user.subject);
    if (!brand) throw new NotFoundException('Brand not found');
    return toDto(brand);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiParam({ name: 'id', type: String, example: 'cuid12345', description: 'Brand identifier' })
  @ApiBody({
    type: BrandProfileWriteDto,
    examples: {
      rename: { summary: 'Rename', value: { name: 'Renamed Brand' } },
      clearDescription: {
        summary: 'Clear description',
        value: { name: 'Renamed Brand', description: null },
      },
    },
  })
  @ApiOperation({ summary: 'Rename or update a brand owned by the authenticated caller' })
  @ApiResponse({
    status: 200,
    description: 'Brand updated',
    type: ApiEnvelopeDto(BrandProfileDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (name empty or too long)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(brandProfileWriteSchema)) body: BrandProfileWriteInput,
  ): Promise<BrandProfileDto> {
    const patch: { name?: string; description?: string | null } = { name: body.name };
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      patch.description = body.description ?? null;
    }
    const updated = await this.repository.update(id, request.user.subject, patch);
    if (!updated) throw new NotFoundException('Brand not found');
    return toDto(updated);
  }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiParam({ name: 'id', type: String, example: 'cuid12345', description: 'Brand identifier' })
  @ApiOperation({ summary: 'Delete a brand owned by the authenticated caller' })
  @ApiResponse({ status: 200, description: 'Brand deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    const removed = await this.repository.delete(id, request.user.subject);
    if (!removed) throw new NotFoundException('Brand not found');
  }
}
