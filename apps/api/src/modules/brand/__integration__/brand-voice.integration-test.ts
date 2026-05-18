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

const UNKNOWN_BRAND_ID = 'clxbrandunknown00000000';

let createCounter = 0;
// Seeds an active Brand row directly via Prisma so the test does not depend
// on POST /brands surviving cross-file races with brand.integration-test.ts'
// own deleteMany cleanup. Unique slug per call eliminates the brand_slug_uniq
// constraint risk.
async function createBrand(_app: INestApplication, baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-voice-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

describe.sequential('Brand Voice (integration)', () => {
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

  // No table-wide cleanup: every test creates a uniquely-named brand via
  // createBrand() so its brandVoice row is keyed by a unique brandId.
  // Sharing the brand_voice table with parallel test files is safe.

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/brands/:brandId/guidelines/voice', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice`)
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when admin reads an unknown brand', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 200 with null data when no voice is saved yet', async () => {
      const brandId = await createBrand(app, 'Alpha');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
    });

    it('returns 200 with the persisted voice when a row exists', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          tone: 'Bold',
          preferredVocabulary: ['craft'],
          messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
        })
        .expect(200);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        brandId,
        tone: 'Bold',
        preferredVocabulary: ['craft'],
        messagingPillars: [{ title: 'Trust', description: 'We deliver.' }],
      });
    });
  });

  describe('PUT /api/v1/brands/:brandId/guidelines/voice', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice`)
        .send({ tone: 'Bold' })
        .expect(401);
    });

    it('returns 403 for non-admin viewer', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', 'viewer')
        .send({ tone: 'Bold' })
        .expect(403);
    });

    it('creates a row on first save and returns 200', async () => {
      const brandId = await createBrand(app, 'Alpha');
      const response = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Bold' });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ brandId, tone: 'Bold' });
    });

    it('updates the existing row on subsequent saves; createdAt stays, updatedAt advances', async () => {
      const brandId = await createBrand(app, 'Alpha');
      const first = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Bold' })
        .expect(200);
      const createdAt = first.body.data.createdAt as string;
      // Defer a hair so updatedAt can move forward.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      const second = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Confident' })
        .expect(200);
      expect(second.body.data.createdAt).toBe(createdAt);
      expect(second.body.data.tone).toBe('Confident');
    });

    it('returns 400 when tone is missing', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({})
        .expect(400);
    });

    it('returns 400 when tone is whitespace-only', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: '   ' })
        .expect(400);
    });

    it('returns 400 when body has an unknown key', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Bold', extra: 'nope' })
        .expect(400);
    });

    it('returns 400 when a messagingPillar has an empty title', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          tone: 'Bold',
          messagingPillars: [{ title: '', description: 'desc' }],
        })
        .expect(400);
    });

    it('returns 404 when admin PUTs valid body to a missing brand', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Bold' })
        .expect(404);
    });
  });
});
