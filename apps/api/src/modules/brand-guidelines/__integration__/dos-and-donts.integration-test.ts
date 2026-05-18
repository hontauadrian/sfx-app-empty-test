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

const UNKNOWN_BRAND = 'clxbrandunknown00000000';
const UNKNOWN_ENTRY = 'clxentryunknown00000000';

async function createBrand(app: INestApplication, name: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/brands')
    .set('x-test-role', AUTH_ROLE_ADMIN)
    .send({ name })
    .expect(201);
  return res.body.data.id as string;
}

describe('Dos & Don\'ts module (integration)', () => {
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
    await prisma.dosDontsEntry.deleteMany();
    await prisma.brandMetadata.deleteMany();
    await prisma.brand.deleteMany();
  });

  afterAll(async () => {
    await prisma.dosDontsEntry.deleteMany();
    await prisma.brandMetadata.deleteMany();
    await prisma.brand.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/brands/:brandId/guidelines/dos-and-donts', () => {
    it('401 without bearer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer()).get(
        `/api/v1/brands/${brandId}/guidelines/dos-and-donts`,
      );
      expect(res.status).toBe(401);
    });

    it('403 for non-admin', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', 'viewer');
      expect(res.status).toBe(403);
    });

    it('404 for unknown brand', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(404);
    });

    it('200 empty list for admin', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: { items: [], latestVersionId: null },
      });
    });

    it('filters by type narrow the list', async () => {
      const brandId = await createBrand(app, 'Acme');
      await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'Do tone' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'dont', category: 'legal', ruleText: 'Avoid copyright' })
        .expect(201);

      const both = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(both.body.data.items).toHaveLength(2);

      const onlyDont = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts?type=dont`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(onlyDont.body.data.items).toHaveLength(1);
      expect(onlyDont.body.data.items[0].type).toBe('dont');

      const onlyLegal = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts?category=legal`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(onlyLegal.body.data.items).toHaveLength(1);
      expect(onlyLegal.body.data.items[0].category).toBe('legal');

      const combined = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts?type=dont&category=legal`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(combined.body.data.items).toHaveLength(1);
    });

    it('400 on unknown query key', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/dos-and-donts?limit=10`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/brands/:brandId/guidelines/dos-and-donts', () => {
    it('401 without bearer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .send({ type: 'do', category: 'tone', ruleText: 'r' });
      expect(res.status).toBe(401);
    });

    it('403 for viewer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', 'viewer')
        .send({ type: 'do', category: 'tone', ruleText: 'r' });
      expect(res.status).toBe(403);
    });

    it('400 bad body (empty ruleText)', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: '' });
      expect(res.status).toBe(400);
    });

    it('400 unknown category', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'spice', ruleText: 'r' });
      expect(res.status).toBe(400);
    });

    it('404 unknown brand (valid body so 400 doesn\'t mask 404)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'r' });
      expect(res.status).toBe(404);
    });

    it('201 on admin happy path', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'Use wordmark' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        brandId,
        type: 'do',
        category: 'tone',
        ruleText: 'Use wordmark',
        exampleText: null,
      });
    });
  });

  describe('PATCH /api/v1/brands/:brandId/guidelines/dos-and-donts/:entryId', () => {
    it('200 on success', async () => {
      const brandId = await createBrand(app, 'Acme');
      const created = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'r' })
        .expect(201);
      const id = created.body.data.id as string;
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ ruleText: 'New text' });
      expect(res.status).toBe(200);
      expect(res.body.data.ruleText).toBe('New text');
    });

    it('404 unknown entry', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ ruleText: 'x' });
      expect(res.status).toBe(404);
    });

    it('404 unknown brand', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ ruleText: 'x' });
      expect(res.status).toBe(404);
    });

    it('401 anonymous', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .send({});
      expect(res.status).toBe(401);
    });

    it('403 viewer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .set('x-test-role', 'viewer')
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/brands/:brandId/guidelines/dos-and-donts/:entryId', () => {
    it('204 on success', async () => {
      const brandId = await createBrand(app, 'Acme');
      const created = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'r' })
        .expect(201);
      const id = created.body.data.id as string;
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(204);
    });

    it('404 unknown entry', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(404);
    });

    it('401 anonymous', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer()).delete(
        `/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`,
      );
      expect(res.status).toBe(401);
    });

    it('403 viewer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${UNKNOWN_ENTRY}`)
        .set('x-test-role', 'viewer');
      expect(res.status).toBe(403);
    });
  });
});
