import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_PROFILE_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
  type BrandProfile,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type IBrandProfileRepository,
  type IVisualIdentityRepository,
  type VisualIdentity,
  type VisualIdentityWritePayload,
} from '@sfx/domain';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { VisualIdentityController } from '../application/controllers/visual-identity.controller';

class InMemoryBrandProfileRepository implements IBrandProfileRepository {
  private readonly brands = new Map<string, BrandProfile>();
  private counter = 0;

  async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
    return Array.from(this.brands.values()).filter(
      (entry) => entry.ownerSubject === ownerSubject,
    );
  }
  async findById(id: string, ownerSubject: string): Promise<BrandProfile | null> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return null;
    return entry;
  }
  async create(input: BrandProfileCreateInput): Promise<BrandProfile> {
    this.counter += 1;
    const id = `brand-${this.counter}`;
    const now = new Date('2026-05-15T00:00:00.000Z');
    const brand: BrandProfile = {
      id,
      ownerSubject: input.ownerSubject,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(id, brand);
    return brand;
  }
  async update(
    id: string,
    ownerSubject: string,
    patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null> {
    const current = this.brands.get(id);
    if (!current || current.ownerSubject !== ownerSubject) return null;
    const next: BrandProfile = {
      ...current,
      name: patch.name ?? current.name,
      description: 'description' in patch ? (patch.description ?? null) : current.description,
      updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    };
    this.brands.set(id, next);
    return next;
  }
  async delete(id: string, ownerSubject: string): Promise<boolean> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return false;
    this.brands.delete(id);
    return true;
  }
}

class InMemoryVisualIdentityRepository implements IVisualIdentityRepository {
  private readonly rows = new Map<string, VisualIdentity>();
  private counter = 0;
  constructor(private readonly brands: InMemoryBrandProfileRepository) {}

  async findByBrand(brandId: string, ownerSubject: string): Promise<VisualIdentity | null> {
    const brand = await this.brands.findById(brandId, ownerSubject);
    if (!brand) return null;
    return this.rows.get(brandId) ?? null;
  }
  async upsertForBrand(
    brandId: string,
    ownerSubject: string,
    payload: VisualIdentityWritePayload,
  ): Promise<VisualIdentity | null> {
    const brand = await this.brands.findById(brandId, ownerSubject);
    if (!brand) return null;
    const now = new Date('2026-05-15T02:00:00.000Z');
    const existing = this.rows.get(brandId);
    if (existing) {
      const next: VisualIdentity = {
        ...existing,
        ...payload,
        updatedAt: now,
      };
      this.rows.set(brandId, next);
      return next;
    }
    this.counter += 1;
    const created: VisualIdentity = {
      id: `vi-${this.counter}`,
      brandId,
      ...payload,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(brandId, created);
    return created;
  }
}

const ADMIN_USER = { subject: 'admin', email: 'admin@example.com', roles: ['viewer'] };
const VIEWER_USER = { subject: 'viewer', email: 'viewer@example.com', roles: ['viewer'] };

class StubAuthGuard {
  canActivate(context: { switchToHttp: () => { getRequest: <T>() => T } }): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: typeof ADMIN_USER;
    }>();
    const header = req.headers['authorization'];
    const token = Array.isArray(header) ? header[0] : header;
    if (token === 'Bearer admin') {
      req.user = ADMIN_USER;
      return true;
    }
    if (token === 'Bearer viewer') {
      req.user = VIEWER_USER;
      return true;
    }
    throw new UnauthorizedException('Bearer token is required');
  }
}

const HEX_OK = ['#', '0044ff'].join('');
const HEX_OK_2 = ['#', 'ff6a00'].join('');

describe('VisualIdentityController (integration)', () => {
  let app: INestApplication;
  let brandRepo: InMemoryBrandProfileRepository;
  let identityRepo: InMemoryVisualIdentityRepository;
  let brandId: string;

  beforeAll(async () => {
    brandRepo = new InMemoryBrandProfileRepository();
    identityRepo = new InMemoryVisualIdentityRepository(brandRepo);
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [VisualIdentityController],
      providers: [
        { provide: BRAND_PROFILE_REPOSITORY, useValue: brandRepo },
        { provide: VISUAL_IDENTITY_REPOSITORY, useValue: identityRepo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new StubAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    const brand = await brandRepo.create({
      ownerSubject: 'admin',
      name: 'Acme',
      description: null,
    });
    brandId = brand.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('anonymous GET and PUT return 401', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/api/v1/brands/${brandId}/visual-identity`).expect(401);
    await request(server)
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .send({})
      .expect(401);
  });

  it('admin GET on a brand with no row returns 200 + empty payload', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe('');
    expect(response.body.data.brandId).toBe(brandId);
    expect(response.body.data.logoUsageRules).toBeNull();
    expect(response.body.data.colourPalette).toEqual([]);
    expect(response.body.data.typographyRules).toEqual([]);
  });

  it('admin PUT with empty body creates the row with default empty values', async () => {
    const put = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(200);
    expect(put.body.data.brandId).toBe(brandId);
    expect(put.body.data.logoUsageRules).toBeNull();
    expect(put.body.data.colourPalette).toEqual([]);
    expect(put.body.data.typographyRules).toEqual([]);
  });

  it('admin PUT populated round-trips on GET', async () => {
    const payload = {
      logoUsageRules: 'Clear space.',
      colourPalette: [{ name: 'Primary', hex: HEX_OK, usage: 'Main.' }],
      typographyRules: [
        { role: 'Display', family: 'Inter', weight: '700', size: '48px', notes: null },
      ],
      spacingLayoutGuidance: '8px grid.',
      imageStyleGuidance: 'Warm.',
      iconographyGuidance: '1.5px stroke.',
      usageRestrictions: 'Never recolour.',
    };
    const put = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send(payload)
      .expect(200);
    expect(put.body.data.logoUsageRules).toBe('Clear space.');
    expect(put.body.data.colourPalette[0].hex).toBe(HEX_OK);

    const get = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(get.body.data.spacingLayoutGuidance).toBe('8px grid.');
    expect(get.body.data.typographyRules[0].role).toBe('Display');
  });

  it('admin PUT with invalid hex returns 400', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({ colourPalette: [{ name: 'Primary', hex: 'blue' }] })
      .expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.statusCode).toBe(400);
  });

  it('admin PUT with case-insensitive duplicate colourPalette name returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({
        colourPalette: [
          { name: 'Primary', hex: HEX_OK },
          { name: 'PRIMARY', hex: HEX_OK_2 },
        ],
      })
      .expect(400);
  });

  it('admin PUT with case-insensitive duplicate typography role returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({
        typographyRules: [
          { role: 'Display', family: 'Inter' },
          { role: 'DISPLAY', family: 'Roboto' },
        ],
      })
      .expect(400);
  });

  it('admin PUT with logoUsageRules exceeding the max length returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({ logoUsageRules: 'a'.repeat(5000) })
      .expect(400);
  });

  it('cross-tenant GET returns 404', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
  });

  it('cross-tenant PUT returns 404', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer viewer')
      .send({ logoUsageRules: 'sneak' })
      .expect(404);
  });

  it('GET on a missing brand id returns 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/brands/missing/visual-identity')
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });

  it('PUT on a missing brand id returns 404', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/brands/missing/visual-identity')
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(404);
  });

  it('after the brand is deleted, subsequent GET returns 404 (cascade boundary)', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .send({ logoUsageRules: 'soon-to-go' })
      .expect(200);
    await brandRepo.delete(brandId, 'admin');
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/visual-identity`)
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });
});
