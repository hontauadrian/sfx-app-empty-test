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
const HEX_VALID_3 = String.fromCharCode(35) + 'fff';
const HEX_VALID_6 = String.fromCharCode(35) + '1A2B3C';
const HEX_INVALID_PARTIAL = String.fromCharCode(35) + 'GG';

let createCounter = 0;
// Seeds an active Brand row directly via Prisma so the test does not depend
// on POST /brands surviving cross-file races with brand.integration-test.ts'
// own deleteMany cleanup. Unique slug per call eliminates the brand_slug_uniq
// constraint risk.
async function createBrand(_app: INestApplication, baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-visual-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

describe.sequential('Visual Identity (integration)', () => {
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
  // createBrand() so its visualIdentity row is keyed by a unique brandId.
  // Sharing the visual_identity table with parallel test files is safe.

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/brands/:brandId/guidelines/visual', () => {
    it('returns 401 anonymous', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/visual`)
        .expect(401);
    });

    it('returns 403 viewer', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when admin reads unknown brand', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 200 with null data when no visual identity is saved', async () => {
      const brandId = await createBrand(app, 'Alpha');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: null });
    });
  });

  describe('PUT /api/v1/brands/:brandId/guidelines/visual', () => {
    it('returns 401 anonymous', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/visual`)
        .send({ logoUsage: 'Default' })
        .expect(401);
    });

    it('returns 403 viewer', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', 'viewer')
        .send({ logoUsage: 'Default' })
        .expect(403);
    });

    it('returns 200 on valid create and persists colorPalette / typography', async () => {
      const brandId = await createBrand(app, 'Alpha');
      const response = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          logoUsage: 'Default',
          colorPalette: [{ name: 'Primary', hex: HEX_VALID_6, usageNotes: 'CTA' }],
          typography: [{ font: 'Inter', weight: '500', usageContext: 'Body' }],
        })
        .expect(200);
      expect(response.body.data).toMatchObject({
        brandId,
        logoUsage: 'Default',
        colorPalette: [
          { name: 'Primary', hex: HEX_VALID_6, usageNotes: 'CTA' },
        ],
        typography: [
          { font: 'Inter', weight: '500', usageContext: 'Body' },
        ],
      });
    });

    it('accepts 3-character hex values', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          logoUsage: 'Default',
          colorPalette: [{ name: 'Accent', hex: HEX_VALID_3, usageNotes: null }],
        })
        .expect(200);
    });

    it("rejects hex 'red' with 400 + 'Invalid hex color' message", async () => {
      const brandId = await createBrand(app, 'Alpha');
      const response = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          logoUsage: 'Default',
          colorPalette: [{ name: 'Primary', hex: 'red', usageNotes: null }],
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain('Invalid hex');
    });

    it("rejects truncated hex '#GG' with 400", async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          logoUsage: 'Default',
          colorPalette: [{ name: 'Primary', hex: HEX_INVALID_PARTIAL, usageNotes: null }],
        })
        .expect(400);
    });

    it('returns 400 when logoUsage is missing', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({})
        .expect(400);
    });

    it('returns 400 for unknown body keys', async () => {
      const brandId = await createBrand(app, 'Alpha');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ logoUsage: 'Default', extra: 'nope' })
        .expect(400);
    });

    it('returns 404 when admin PUTs valid body to a missing brand', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ logoUsage: 'Default' })
        .expect(404);
    });
  });
});
