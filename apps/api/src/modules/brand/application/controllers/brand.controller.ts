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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createBrandSchema, renameBrandSchema, zodApiBody } from '@sfx/validation';
import type {
  Brand,
  BrandRepository,
  CreateBrandInput,
  RenameBrandInput,
} from '@sfx/domain';
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
import { AuthRoles } from '../../../../common/decorators/auth-roles.decorator';
import { ResourceCaptures } from '../../../../common/decorators/resource-captures.decorator';
import { ApiEnvelopeDto } from '../../../../common/dto/envelope.dto';
import {
  JwtAuthGuard,
  type RequestWithAuthenticatedUser,
} from '../../../../common/guards/jwt-auth.guard';
import { BRAND_REPOSITORY } from '../../data/repositories/brand.tokens';
import { BrandDto, BrandsListDto } from '../dto/brand.dto';
import { CreateBrandPipe } from '../pipes/create-brand.pipe';
import { RenameBrandPipe } from '../pipes/rename-brand.pipe';

@ApiTags('brand')
@Controller('brands')
@UseGuards(JwtAuthGuard)
@AuthRoles(AUTH_ROLE_ADMIN)
@ApiBearerAuth('accessToken')
export class BrandController {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly repository: BrandRepository,
  ) {}

  @Get()
  @AuthRoles(AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT)
  @ApiOperation({
    summary: 'List active brand profiles newest-first',
    description:
      'Returns active brand profiles (deleted_at IS NULL) ordered by `createdAt DESC, id DESC`. Soft-deleted brands are filtered out. Accepts admin OR agent role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active brand profiles wrapped in the standard envelope',
    type: ApiEnvelopeDto(BrandsListDto),
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin or agent role' })
  async listBrands(): Promise<{ brands: readonly Brand[] }> {
    return { brands: await this.repository.listActive() };
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a brand profile',
    description:
      'Creates a new brand profile. Slug is server-derived from `name` (NFKD + kebab-case); clients never supply a slug. `ownerUserId` is set from the authenticated request user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Created brand profile',
    type: ApiEnvelopeDto(BrandDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiBody(
    zodApiBody(createBrandSchema, 'CreateBrandInput', {
      extensions: { 'x-probe-unique-fields': ['name'] },
    }),
  )
  @ApiExtension('x-probe-unique-fields', ['name'])
  @ResourceCaptures(
    { fromPath: 'id', resource: 'brand', pathParam: 'id' },
    { fromPath: 'id', resource: 'brand', pathParam: 'brandId' },
  )
  async createBrand(
    @Body(CreateBrandPipe) input: CreateBrandInput,
    @Req() req: RequestWithAuthenticatedUser,
  ): Promise<Brand> {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Authenticated user context is missing');
    }
    return this.repository.create(input, user.subject);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a brand profile',
    description:
      'Renames an active brand profile. Slug is re-derived from the new name and deduped against the active set.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Brand identifier' })
  @ApiBody(zodApiBody(renameBrandSchema, 'RenameBrandInput'))
  @ApiResponse({
    status: 200,
    description: 'Updated brand profile',
    type: ApiEnvelopeDto(BrandDto),
  })
  @ApiResponse({ status: 400, description: 'Validation failed (per-field error list)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or soft-deleted)' })
  async renameBrand(
    @Param('id') id: string,
    @Body(RenameBrandPipe) input: RenameBrandInput,
  ): Promise<Brand> {
    const brand = await this.repository.renameById(id, input);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return brand;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete a brand profile',
    description:
      'Sets `deletedAt` on an active brand profile. Subsequent GET/PATCH/DELETE on the same id return 404. The slug is not reserved — a new brand may reuse the same name.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Brand identifier' })
  @ApiResponse({ status: 204, description: 'Brand soft-deleted (no body)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Authenticated user lacks the admin role' })
  @ApiResponse({ status: 404, description: 'Brand not found (missing or already soft-deleted)' })
  async deleteBrand(@Param('id') id: string): Promise<void> {
    const deleted = await this.repository.softDeleteById(id);
    if (!deleted) {
      throw new NotFoundException('Brand not found');
    }
  }
}
