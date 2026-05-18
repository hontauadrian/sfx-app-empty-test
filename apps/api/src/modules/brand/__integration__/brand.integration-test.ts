import './setup-env';
import 'reflect-metadata';
import {
  INestApplication,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AUTH_ROLE_ADMIN } from '@sfx/shared';
import { prisma } from '@sfx/database';
import { AppModule } from '../../../app.module';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AUTH_ROLES_KEY } from '../../../common/decorators/auth-roles.decorator';

interface TestRequest {
  headers: { 'x-test-role'?: string | string[] };
  user?: { subject: string; email: string; roles: string[] };
}

function buildTestAuthGuard(reflector: Reflector): CanActivate {
  return {
    canActivate(context: ExecutionContext): boolean {
      const incoming = context.switchToHttp().getRequest<TestRequest>();
      const header = incoming.headers['x-test-role'];
      const role = Array.isArray(header) ? header[0] : header;
      if (!role) throw new UnauthorizedException('Bearer token is required');
      const requiredRoles =
        reflector.getAllAndOverride<string[]>(AUTH_ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];
      const userRoles = role === 'anonymous' ? [] : [role];
      if (
        requiredRoles.length > 0 &&
        !requiredRoles.some((needed) => userRoles.includes(needed))
      ) {
        throw new ForbiddenException('Missing required role');
      }
      incoming.user = {
        subject: `subject-${role}`,
        email: `${role}@example.test`,
        roles: userRoles,
      };
      return true;
    },
  };
}

const UNKNOWN_ID = 'clxbrandunknown00000000';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('Brand module (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(buildTestAuthGuard(new Reflector()))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    await prisma.brand.deleteMany();
  });

  afterAll(async () => {
    await prisma.brand.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/brands', () => {
    it('returns 401 when no bearer token is present', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/brands');
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false, error: { statusCode: 401 } });
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', 'viewer');
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, error: { statusCode: 403 } });
    });

    it('returns 200 + empty list when admin calls on an empty table', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { brands: [] } });
    });

    it('returns 200 + active brands newest-first when admin calls after seeded inserts', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Alpha' })
        .expect(201);
      await sleep(5);
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Beta' })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const names = response.body.data.brands.map((brand: { name: string }) => brand.name);
      expect(names).toEqual(['Beta', 'Alpha']);
    });

    it('excludes soft-deleted brands from the active list', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Gamma' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.body.data.brands).toHaveLength(0);
    });
  });

  describe('POST /api/v1/brands', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .send({ name: 'Acme' })
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', 'viewer')
        .send({ name: 'Acme' })
        .expect(403);
    });

    it('returns 201 + persisted Brand envelope when admin creates with a valid name', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Acme Holdings' });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: expect.any(String),
        name: 'Acme Holdings',
        slug: 'acme-holdings',
        ownerUserId: 'subject-admin',
        deletedAt: null,
      });
    });

    it('returns 400 with a per-field error when name is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.statusCode).toBe(400);
    });

    it('returns 400 when name is empty string', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: '' })
        .expect(400);
    });

    it('returns 400 when name exceeds 200 chars', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'x'.repeat(201) })
        .expect(400);
    });

    it('returns 400 when name is whitespace-only (trim → empty)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: '   ' })
        .expect(400);
    });

    it('returns 400 on unknown body key (Zod .strict)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Acme', slug: 'client-supplied' })
        .expect(400);
    });

    it('derives a unique slug when two brands have the same name (-2 suffix)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Twin' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Twin' })
        .expect(201);
      expect(first.body.data.slug).toBe('twin');
      expect(second.body.data.slug).toBe('twin-2');
    });

    it('derives a unique slug across three identical names (-2, -3 progression)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Trip' })
        .expect(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Trip' })
        .expect(201);
      const third = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Trip' })
        .expect(201);
      expect([first.body.data.slug, second.body.data.slug, third.body.data.slug]).toEqual([
        'trip',
        'trip-2',
        'trip-3',
      ]);
    });
  });

  describe('PATCH /api/v1/brands/:id', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${UNKNOWN_ID}`)
        .send({ name: 'Renamed' })
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${UNKNOWN_ID}`)
        .set('x-test-role', 'viewer')
        .send({ name: 'Renamed' })
        .expect(403);
    });

    it('returns 404 when admin renames a syntactically valid but unknown id', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${UNKNOWN_ID}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Renamed' })
        .expect(404);
    });

    it('returns 404 when admin renames a soft-deleted brand', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Doomed' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'TooLate' })
        .expect(404);
    });

    it('returns 200 + updated Brand (slug regenerated from new name) when admin renames an active brand', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Original' })
        .expect(201);
      const brandId = created.body.data.id as string;
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'After Rename' })
        .expect(200);
      expect(response.body.data).toMatchObject({
        id: brandId,
        name: 'After Rename',
        slug: 'after-rename',
      });
    });

    it('returns 400 when the new name is empty', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Small' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: '' })
        .expect(400);
    });

    it('returns 400 when the new name is whitespace-only', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Med' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: '   ' })
        .expect(400);
    });

    it('returns 400 when the new name exceeds 200 chars', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Tall' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'x'.repeat(201) })
        .expect(400);
    });

    it('dedupes slug on rename when another active brand owns the natural slug', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Lakeshore' })
        .expect(201);
      const other = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Other' })
        .expect(201);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${other.body.data.id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Lakeshore' })
        .expect(200);
      expect(response.body.data.slug).toBe('lakeshore-2');
    });
  });

  describe('DELETE /api/v1/brands/:id', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${UNKNOWN_ID}`)
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${UNKNOWN_ID}`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when admin deletes an unknown id', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${UNKNOWN_ID}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 404 when admin deletes an already-soft-deleted brand (idempotency)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'TwiceDelete' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 204 + sets deletedAt when admin deletes an active brand', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Gonna Go' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      const row = await prisma.brand.findUnique({ where: { id: brandId } });
      expect(row?.deletedAt).toBeInstanceOf(Date);
    });

    it('removes the soft-deleted brand from a subsequent GET /api/v1/brands', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Vanisher' })
        .expect(201);
      const brandId = created.body.data.id as string;
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      const response = await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(
        response.body.data.brands.find((brand: { id: string }) => brand.id === brandId),
      ).toBeUndefined();
    });

    it('allows a subsequent POST with the same name to succeed (deleted slug is not reserved)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Phoenix' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${first.body.data.id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      const second = await request(app.getHttpServer())
        .post('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ name: 'Phoenix' })
        .expect(201);
      expect(second.body.data.slug).toBe('phoenix');
    });
  });
});
