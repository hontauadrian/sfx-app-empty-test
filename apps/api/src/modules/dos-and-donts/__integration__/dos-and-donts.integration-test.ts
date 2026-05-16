import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_PROFILE_REPOSITORY,
  DOS_AND_DONT_REPOSITORY,
  type BrandProfile,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type DosAndDontCreateInput,
  type DosAndDontEntry,
  type DosAndDontListFilter,
  type DosAndDontUpdatePatch,
  type IBrandProfileRepository,
  type IDosAndDontRepository,
} from '@sfx/domain';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { DosAndDontController } from '../application/controllers/dos-and-dont.controller';

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

class InMemoryDosAndDontRepository implements IDosAndDontRepository {
  private readonly rows = new Map<string, DosAndDontEntry>();
  private counter = 0;

  async listByBrand(
    brandId: string,
    filter?: DosAndDontListFilter,
  ): Promise<DosAndDontEntry[]> {
    return Array.from(this.rows.values()).filter((row) => {
      if (row.brandId !== brandId) return false;
      if (filter?.category !== undefined && row.category !== filter.category) return false;
      return true;
    });
  }

  async findById(brandId: string, entryId: string): Promise<DosAndDontEntry | null> {
    const row = this.rows.get(entryId);
    if (!row || row.brandId !== brandId) return null;
    return row;
  }

  async create(input: DosAndDontCreateInput): Promise<DosAndDontEntry> {
    this.counter += 1;
    const id = `e-${this.counter}`;
    const now = new Date('2026-05-15T00:00:00.000Z');
    const row: DosAndDontEntry = {
      id,
      brandId: input.brandId,
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      suggestedCorrection: input.suggestedCorrection,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, row);
    return row;
  }

  async update(
    brandId: string,
    entryId: string,
    patch: DosAndDontUpdatePatch,
  ): Promise<DosAndDontEntry | null> {
    const current = this.rows.get(entryId);
    if (!current || current.brandId !== brandId) return null;
    const next: DosAndDontEntry = {
      ...current,
      type: patch.type,
      category: patch.category,
      title: patch.title,
      body: patch.body,
      suggestedCorrection: patch.suggestedCorrection,
      updatedAt: new Date('2026-05-15T02:00:00.000Z'),
    };
    this.rows.set(entryId, next);
    return next;
  }

  async delete(brandId: string, entryId: string): Promise<boolean> {
    const current = this.rows.get(entryId);
    if (!current || current.brandId !== brandId) return false;
    this.rows.delete(entryId);
    return true;
  }

  removeAllForBrand(brandId: string): void {
    for (const [id, row] of this.rows) {
      if (row.brandId === brandId) this.rows.delete(id);
    }
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

describe('DosAndDontController (integration)', () => {
  let app: INestApplication;
  let brandRepo: InMemoryBrandProfileRepository;
  let dosRepo: InMemoryDosAndDontRepository;
  let brandId: string;

  beforeAll(async () => {
    brandRepo = new InMemoryBrandProfileRepository();
    dosRepo = new InMemoryDosAndDontRepository();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DosAndDontController],
      providers: [
        { provide: BRAND_PROFILE_REPOSITORY, useValue: brandRepo },
        { provide: DOS_AND_DONT_REPOSITORY, useValue: dosRepo },
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

  it('anonymous LIST / POST / GET-one / PUT / DELETE return 401', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/api/v1/brands/${brandId}/dos-and-donts`).expect(401);
    await request(server)
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .send({ type: 'do', category: 'tone', title: 't', body: 'b' })
      .expect(401);
    await request(server)
      .get(`/api/v1/brands/${brandId}/dos-and-donts/missing`)
      .expect(401);
    await request(server)
      .put(`/api/v1/brands/${brandId}/dos-and-donts/missing`)
      .send({ type: 'do', category: 'tone', title: 't', body: 'b' })
      .expect(401);
    await request(server)
      .delete(`/api/v1/brands/${brandId}/dos-and-donts/missing`)
      .expect(401);
  });

  it('admin LIST on a brand with no entries returns 200 + data:[]', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
  });

  it('admin POST happy returns 201 + envelope and the entry persists', async () => {
    const post = await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({
        type: 'do',
        category: 'tone',
        title: 'Use active voice',
        body: 'Prefer active over passive.',
      })
      .expect(201);
    expect(post.body.data.brandId).toBe(brandId);
    expect(post.body.data.type).toBe('do');
    expect(post.body.data.title).toBe('Use active voice');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('admin GET-one round-trips after POST', async () => {
    const post = await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'dont', category: 'visuals', title: 'No recoloured logos', body: 'no tints' })
      .expect(201);
    const entryId = post.body.data.id;
    const get = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(get.body.data.id).toBe(entryId);
    expect(get.body.data.category).toBe('visuals');
  });

  it('admin LIST filtered by ?category=tone returns only tone entries', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 'Tone', body: 'tone body' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'dont', category: 'legal', title: 'Legal', body: 'legal body' })
      .expect(201);
    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts?category=tone`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].category).toBe('tone');
  });

  it('admin LIST with ?category=invalid returns 400', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts?category=marketing`)
      .set('Authorization', 'Bearer admin')
      .expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.statusCode).toBe(400);
  });

  it('admin PUT happy returns 200 + envelope reflects the update', async () => {
    const post = await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 'old', body: 'old' })
      .expect(201);
    const put = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/dos-and-donts/${post.body.data.id}`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'dont', category: 'legal', title: 'new', body: 'new' })
      .expect(200);
    expect(put.body.data.title).toBe('new');
    expect(put.body.data.category).toBe('legal');
  });

  it('admin DELETE happy returns 200 and subsequent GET-one returns 404', async () => {
    const post = await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'vocabulary', title: 'delete me', body: 'soon gone' })
      .expect(201);
    const entryId = post.body.data.id;
    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });

  it('admin POST with empty title (whitespace) returns 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: '   ', body: 'b' })
      .expect(400);
  });

  it('admin POST with empty body returns 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 't', body: '   ' })
      .expect(400);
  });

  it('admin POST with unknown type returns 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'maybe', category: 'tone', title: 't', body: 'b' })
      .expect(400);
  });

  it('admin POST with unknown category returns 400', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'marketing', title: 't', body: 'b' })
      .expect(400);
  });

  it('admin POST with oversize title returns 400', async () => {
    const oversize = 'a'.repeat(500);
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: oversize, body: 'b' })
      .expect(400);
  });

  it('admin POST with oversize body returns 400', async () => {
    const oversize = 'a'.repeat(5000);
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 't', body: oversize })
      .expect(400);
  });

  it('cross-tenant LIST / GET-one / POST / PUT / DELETE return 404', async () => {
    const post = await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 't', body: 'b' })
      .expect(201);
    const entryId = post.body.data.id;
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer viewer')
      .send({ type: 'do', category: 'tone', title: 't', body: 'b' })
      .expect(404);
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer viewer')
      .send({ type: 'do', category: 'tone', title: 'h', body: 'h' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${brandId}/dos-and-donts/${entryId}`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
  });

  it('unknown brandId returns 404 on LIST and GET-one', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/brands/missing-brand/dos-and-donts')
      .set('Authorization', 'Bearer admin')
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/brands/missing-brand/dos-and-donts/missing-entry')
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });

  it('after brand delete, subsequent LIST returns 404 (cascade boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .send({ type: 'do', category: 'tone', title: 't', body: 'b' })
      .expect(201);
    dosRepo.removeAllForBrand(brandId);
    await brandRepo.delete(brandId, 'admin');
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/dos-and-donts`)
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });
});
