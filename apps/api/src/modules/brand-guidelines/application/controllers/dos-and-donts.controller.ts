import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  BrandGuidelinesVersionRepository,
  BrandRepository,
  DosDontsEntry,
  DosDontsRepository,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import {
  createDosDontsEntrySchema,
  dosDontsEntryResponseSchema,
  dosDontsListResponseSchema,
  updateDosDontsEntrySchema,
  zodApiBody,
  zodToOpenApi,
} from '@sfx/validation';
import type { ChangeNoteQuery } from '@sfx/validation';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import {
  JwtAuthGuard,
  type RequestWithAuthenticatedUser,
} from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../../brand/data/repositories/brand.tokens';
import { BRAND_GUIDELINES_VERSION_REPOSITORY } from '../../../brand/data/repositories/brand-guidelines.tokens';
import { DOS_DONTS_REPOSITORY } from '../../data/repositories/brand-guidelines.tokens';
import { ChangeNoteQueryPipe } from '../pipes/change-note-query.pipe';
import {
  CreateDosDontsEntryPipe,
} from '../pipes/create-dos-donts-entry.pipe';
import {
  ListDosDontsQueryPipe,
} from '../pipes/list-dos-donts-query.pipe';
import {
  UpdateDosDontsEntryPipe,
} from '../pipes/update-dos-donts-entry.pipe';
import { DosDontsEntryDto, DosDontsListDto } from '../dto/dos-and-donts.dto';
import type {
  CreateDosDontsEntryBody,
  DosDontsListQuery,
  UpdateDosDontsEntryBody,
} from '@sfx/validation';

@ApiTags('brand-guidelines')
@Controller('brands/:brandId/guidelines/dos-and-donts')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiBearerAuth('accessToken')
export class DosAndDontsController {
  constructor(
    @Inject(DOS_DONTS_REPOSITORY)
    private readonly repository: DosDontsRepository,
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: BrandRepository,
    @Inject(BRAND_GUIDELINES_VERSION_REPOSITORY)
    private readonly versionRepository: BrandGuidelinesVersionRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'List active D&D entries newest-first',
    description:
      'Returns the active brand\'s Dos & Don\'ts entries ordered by `createdAt DESC, id DESC`. Optional `?type` and `?category` query filters narrow the result set server-side. Intentionally not paginated — admin-curated lists are bounded.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiQuery({
    name: 'type',
    required: false,
    type: String,
    enum: ['do', 'dont'],
    description: 'Narrow by D&D type',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    enum: ['tone', 'vocabulary', 'visuals', 'legal', 'campaign-messaging'],
    description: 'Narrow by category',
  })
  @ApiResponse({
    status: 200,
    description: 'Active D&D entries wrapped in the standard envelope',
    schema: zodToOpenApi(dosDontsListResponseSchema, { ref: 'DosDontsList' }) as never,
    type: DosDontsListDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async listEntries(
    @Param('brandId') brandId: string,
    @Query(ListDosDontsQueryPipe) query: DosDontsListQuery,
  ): Promise<{ items: readonly DosDontsEntry[]; latestVersionId: string | null }> {
    await this.requireBrand(brandId);
    const [items, latestVersion] = await Promise.all([
      this.repository.listByBrand(brandId, { type: query.type, category: query.category }),
      this.versionRepository.findLatestForBrand(brandId),
    ]);
    return { items, latestVersionId: latestVersion?.id ?? null };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a D&D entry',
    description: 'Creates a new Dos & Don\'ts entry for the given brand.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiBody({
    ...zodApiBody(createDosDontsEntrySchema, 'CreateDosDontsEntryInput', {
      extensions: { 'x-probe-unique-fields': ['ruleText'] },
    }),
    examples: {
      default: {
        summary: 'Standard do entry',
        value: {
          type: 'do',
          category: 'tone',
          ruleText: 'Use the official wordmark.',
          exampleText: 'Marketing emails',
        },
      },
    },
  })
  @ApiExtension('x-probe-unique-fields', ['ruleText'])
  @ApiResponse({
    status: 201,
    description: 'Created D&D entry',
    schema: zodToOpenApi(dosDontsEntryResponseSchema, { ref: 'DosDontsEntry' }) as never,
    type: DosDontsEntryDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row created by this mutation',
  })
  @ResourceCaptures({ fromPath: 'id', resource: 'dosDontsEntry', pathParam: 'entryId' })
  async createEntry(
    @Param('brandId') brandId: string,
    @Body(CreateDosDontsEntryPipe) input: CreateDosDontsEntryBody,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<DosDontsEntry> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    await this.requireBrand(brandId);
    return this.repository.createInBrand(
      brandId,
      input,
      { editorUserId: user.subject, editorDisplayName: user.email ?? user.subject },
      changeNoteQuery.changeNote ?? null,
    );
  }

  @Patch(':entryId')
  @ApiOperation({
    summary: 'Update a D&D entry',
    description: 'Partial update on a Dos & Don\'ts entry scoped to the parent brand.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiParam({ name: 'entryId', type: String, description: 'D&D entry identifier' })
  @ApiBody(zodApiBody(updateDosDontsEntrySchema, 'UpdateDosDontsEntryInput'))
  @ApiResponse({
    status: 200,
    description: 'Updated D&D entry',
    schema: zodToOpenApi(dosDontsEntryResponseSchema, { ref: 'DosDontsEntry' }) as never,
    type: DosDontsEntryDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand or entry not found' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row',
  })
  async updateEntry(
    @Param('brandId') brandId: string,
    @Param('entryId') entryId: string,
    @Body(UpdateDosDontsEntryPipe) input: UpdateDosDontsEntryBody,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<DosDontsEntry> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    await this.requireBrand(brandId);
    const updated = await this.repository.updateInBrandById(
      brandId,
      entryId,
      input,
      { editorUserId: user.subject, editorDisplayName: user.email ?? user.subject },
      changeNoteQuery.changeNote ?? null,
    );
    if (!updated) {
      throw new NotFoundException('D&D entry not found');
    }
    return updated;
  }

  @Delete(':entryId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a D&D entry',
    description: 'Hard-deletes a Dos & Don\'ts entry scoped to the parent brand.',
  })
  @ApiParam({ name: 'brandId', type: String, description: 'Brand identifier' })
  @ApiParam({ name: 'entryId', type: String, description: 'D&D entry identifier' })
  @ApiResponse({ status: 204, description: 'Entry deleted (no body)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand or entry not found' })
  @ApiQuery({
    name: 'changeNote',
    required: false,
    type: String,
    description: 'Optional change note attached to the BrandGuidelinesVersion row',
  })
  async deleteEntry(
    @Param('brandId') brandId: string,
    @Param('entryId') entryId: string,
    @Query(ChangeNoteQueryPipe) changeNoteQuery: ChangeNoteQuery,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<void> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    await this.requireBrand(brandId);
    const deleted = await this.repository.deleteInBrandById(
      brandId,
      entryId,
      { editorUserId: user.subject, editorDisplayName: user.email ?? user.subject },
      changeNoteQuery.changeNote ?? null,
    );
    if (!deleted) {
      throw new NotFoundException('D&D entry not found');
    }
  }

  private async requireBrand(brandId: string): Promise<void> {
    const brand = await this.brandRepository.findActiveById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }
}
