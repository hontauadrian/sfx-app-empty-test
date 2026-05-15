import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BRAND_PROFILE_REPOSITORY,
  type BrandProfile,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type IBrandProfileRepository,
} from '@sfx/domain';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { BrandProfileController } from '../application/controllers/brand-profile.controller';

class InMemoryBrandProfileRepository implements IBrandProfileRepository {
  private readonly brands = new Map<string, BrandProfile>();
  private counter = 0;

  async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
    return Array.from(this.brands.values())
      .filter((entry) => entry.ownerSubject === ownerSubject)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
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
    const entry: BrandProfile = {
      id,
      ownerSubject: input.ownerSubject,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(id, entry);
    return entry;
  }

  async update(
    id: string,
    ownerSubject: string,
    patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null> {
    const current = this.brands.get(id);
    if (!current || current.ownerSubject !== ownerSubject) return null;
    const updated: BrandProfile = {
      ...current,
      name: patch.name ?? current.name,
      description: 'description' in patch ? (patch.description ?? null) : current.description,
      updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    };
    this.brands.set(id, updated);
    return updated;
  }

  async delete(id: string, ownerSubject: string): Promise<boolean> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return false;
    this.brands.delete(id);
    return true;
  }
}

const ADMIN_USER = { subject: 'admin', email: 'admin@example.com', roles: ['viewer'] };
const VIEWER_USER = { subject: 'viewer', email: 'viewer@example.com', roles: ['viewer'] };

class StubAuthGuard {
  canActivate(context: { switchToHttp: () => { getRequest: <T>() => T } }): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: typeof ADMIN_USER;
    }>();
    const header = request.headers['authorization'];
    const token = Array.isArray(header) ? header[0] : header;
    if (token === 'Bearer admin') {
      request.user = ADMIN_USER;
      return true;
    }
    if (token === 'Bearer viewer') {
      request.user = VIEWER_USER;
      return true;
    }
    throw new UnauthorizedException('Bearer token is required');
  }
}

describe('BrandProfileController (integration)', () => {
  let app: INestApplication;
  let repository: InMemoryBrandProfileRepository;

  beforeAll(async () => {
    repository = new InMemoryBrandProfileRepository();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [BrandProfileController],
      providers: [{ provide: BRAND_PROFILE_REPOSITORY, useValue: repository }],
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

  afterAll(async () => {
    await app.close();
  });

  it('rejects anonymous requests on every endpoint with 401', async () => {
    const server = app.getHttpServer();
    const paths: ReadonlyArray<['get' | 'post' | 'put' | 'delete', string]> = [
      ['get', '/api/v1/brands'],
      ['post', '/api/v1/brands'],
      ['get', '/api/v1/brands/missing'],
      ['put', '/api/v1/brands/missing'],
      ['delete', '/api/v1/brands/missing'],
    ];
    for (const [method, path] of paths) {
      const response = await request(server)[method](path);
      expect(response.status).toBe(401);
    }
  });

  it('runs the full happy path: list → create → get → update → delete', async () => {
    const server = app.getHttpServer();

    const initialList = await request(server)
      .get('/api/v1/brands')
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(initialList.body).toEqual({ success: true, data: [] });

    const created = await request(server)
      .post('/api/v1/brands')
      .set('Authorization', 'Bearer admin')
      .send({ name: 'Acme Brand', description: 'A test brand' })
      .expect(201);
    expect(created.body.success).toBe(true);
    expect(created.body.data.name).toBe('Acme Brand');
    const brandId = created.body.data.id as string;

    const got = await request(server)
      .get(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(got.body.data.id).toBe(brandId);

    const updated = await request(server)
      .put(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer admin')
      .send({ name: 'Renamed Brand' })
      .expect(200);
    expect(updated.body.data.name).toBe('Renamed Brand');

    await request(server)
      .delete(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer admin')
      .expect(200);

    await request(server)
      .get(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });

  it('rejects an empty name with 400 and a validation error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', 'Bearer admin')
      .send({ name: '   ' })
      .expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.statusCode).toBe(400);
  });

  it('returns 404 when a different user tries to read another tenant brand', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/brands')
      .set('Authorization', 'Bearer admin')
      .send({ name: 'Admin-only Brand' })
      .expect(201);
    const brandId = created.body.data.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer viewer')
      .send({ name: 'Hijack' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/brands/${brandId}`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
  });
});
