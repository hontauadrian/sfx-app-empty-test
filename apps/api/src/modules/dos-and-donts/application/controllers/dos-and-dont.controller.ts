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
  Query,
  Req,
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
import {
  BRAND_PROFILE_REPOSITORY,
  DOS_AND_DONT_REPOSITORY,
  type DosAndDontCategory,
  type DosAndDontEntry,
  type DosAndDontType,
  type IBrandProfileRepository,
  type IDosAndDontRepository,
} from '@sfx/domain';
import {
  DOS_AND_DONT_CATEGORY_VALUES,
  dosAndDontListQuerySchema,
  dosAndDontWriteSchema,
  type DosAndDontListQueryInput,
  type DosAndDontWriteInput,
} from '@sfx/validation';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedRequest } from '../../../auth/application/types/authenticated-request';
import { DosAndDontDto } from '../dto/dos-and-dont.dto';
import { DosAndDontEnvelopeDto } from '../dto/dos-and-dont-envelope.dto';
import { DosAndDontListEnvelopeDto } from '../dto/dos-and-dont-list-envelope.dto';
import { DosAndDontWriteDto } from '../dto/dos-and-dont-write.dto';

function toDto(entry: DosAndDontEntry): DosAndDontDto {
  return {
    id: entry.id,
    brandId: entry.brandId,
    type: entry.type,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    suggestedCorrection: entry.suggestedCorrection,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

const WRITE_EXAMPLES = {
  doToneEntry: {
    summary: 'Do (tone)',
    value: {
      type: 'do',
      category: 'tone',
      title: 'Use active voice',
      body: 'Prefer we ship over products are shipped.',
    },
  },
  dontVisualsEntry: {
    summary: 'Dont (visuals)',
    value: {
      type: 'dont',
      category: 'visuals',
      title: 'No recoloured logos',
      body: 'Never tint, gradient, or recolour the primary mark.',
      suggestedCorrection: 'Use the monochrome variant from the asset library.',
    },
  },
};

@ApiTags('dos-and-donts')
@Controller('brands/:brandId/dos-and-donts')
export class DosAndDontController {
  constructor(
    @Inject(BRAND_PROFILE_REPOSITORY)
    private readonly brandProfileRepository: IBrandProfileRepository,
    @Inject(DOS_AND_DONT_REPOSITORY)
    private readonly dosAndDontRepository: IDosAndDontRepository,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List dos-and-donts entries for the authenticated caller' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiQuery({
    name: 'category',
    type: String,
    required: false,
    enum: DOS_AND_DONT_CATEGORY_VALUES,
    description: 'Optional category filter (empty value is the same as no filter)',
  })
  @ApiResponse({
    status: 200,
    description: 'Entries owned by the caller, ordered by category ASC, type ASC, createdAt DESC',
    type: DosAndDontListEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Unknown category enum' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async list(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Query(new ZodValidationPipe(dosAndDontListQuerySchema))
    query: DosAndDontListQueryInput,
  ): Promise<DosAndDontDto[]> {
    const brand = await this.brandProfileRepository.findById(
      brandId,
      request.user.subject,
    );
    if (!brand) throw new NotFoundException('Brand not found');
    const filter = query.category
      ? { category: query.category as DosAndDontCategory }
      : undefined;
    const entries = await this.dosAndDontRepository.listByBrand(brandId, filter);
    return entries.map(toDto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ResourceCaptures(
    { fromPath: 'id', resource: 'dosAndDontEntry', pathParam: 'id' },
    { fromPath: 'brandId', resource: 'brandProfile', pathParam: 'brandId' },
  )
  @ApiOperation({ summary: 'Create a dos-and-donts entry on the caller-owned brand' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiBody({ type: DosAndDontWriteDto, examples: WRITE_EXAMPLES })
  @ApiResponse({
    status: 201,
    description: 'Entry created',
    type: DosAndDontEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 404, description: 'Brand not found or not owned by caller' })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Body(new ZodValidationPipe(dosAndDontWriteSchema)) body: DosAndDontWriteInput,
  ): Promise<DosAndDontDto> {
    const brand = await this.brandProfileRepository.findById(
      brandId,
      request.user.subject,
    );
    if (!brand) throw new NotFoundException('Brand not found');
    const created = await this.dosAndDontRepository.create({
      brandId,
      type: body.type as DosAndDontType,
      category: body.category as DosAndDontCategory,
      title: body.title,
      body: body.body,
      suggestedCorrection: body.suggestedCorrection ?? null,
    });
    return toDto(created);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get a dos-and-donts entry on the caller-owned brand' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cuid67890',
    description: 'Dos-and-donts entry identifier',
  })
  @ApiResponse({
    status: 200,
    description: 'Entry found',
    type: DosAndDontEnvelopeDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({
    status: 404,
    description: 'Brand not found, entry not found, or not owned by caller',
  })
  async findById(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Param('id') entryId: string,
  ): Promise<DosAndDontDto> {
    const brand = await this.brandProfileRepository.findById(
      brandId,
      request.user.subject,
    );
    if (!brand) throw new NotFoundException('Brand not found');
    const entry = await this.dosAndDontRepository.findById(brandId, entryId);
    if (!entry) throw new NotFoundException('Entry not found');
    return toDto(entry);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update (full replace) a dos-and-donts entry' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cuid67890',
    description: 'Dos-and-donts entry identifier',
  })
  @ApiBody({ type: DosAndDontWriteDto, examples: WRITE_EXAMPLES })
  @ApiResponse({
    status: 200,
    description: 'Entry updated',
    type: DosAndDontEnvelopeDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({
    status: 404,
    description: 'Brand not found, entry not found, or not owned by caller',
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Param('id') entryId: string,
    @Body(new ZodValidationPipe(dosAndDontWriteSchema)) body: DosAndDontWriteInput,
  ): Promise<DosAndDontDto> {
    const brand = await this.brandProfileRepository.findById(
      brandId,
      request.user.subject,
    );
    if (!brand) throw new NotFoundException('Brand not found');
    const updated = await this.dosAndDontRepository.update(brandId, entryId, {
      type: body.type as DosAndDontType,
      category: body.category as DosAndDontCategory,
      title: body.title,
      body: body.body,
      suggestedCorrection: body.suggestedCorrection ?? null,
    });
    if (!updated) throw new NotFoundException('Entry not found');
    return toDto(updated);
  }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Delete a dos-and-donts entry' })
  @ApiParam({
    name: 'brandId',
    type: String,
    example: 'cuid12345',
    description: 'Brand identifier',
  })
  @ApiParam({
    name: 'id',
    type: String,
    example: 'cuid67890',
    description: 'Dos-and-donts entry identifier',
  })
  @ApiResponse({ status: 200, description: 'Entry deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({
    status: 404,
    description: 'Brand not found, entry not found, or not owned by caller',
  })
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('brandId') brandId: string,
    @Param('id') entryId: string,
  ): Promise<void> {
    const brand = await this.brandProfileRepository.findById(
      brandId,
      request.user.subject,
    );
    if (!brand) throw new NotFoundException('Brand not found');
    const removed = await this.dosAndDontRepository.delete(brandId, entryId);
    if (!removed) throw new NotFoundException('Entry not found');
  }
}
