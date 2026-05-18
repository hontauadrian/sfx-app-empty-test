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

async function createBrand(app: INestApplication, name: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/brands')
    .set('x-test-role', AUTH_ROLE_ADMIN)
    .send({ name })
    .expect(201);
  return res.body.data.id as string;
}

describe('Brand metadata module (integration)', () => {
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

  describe('GET /api/v1/brands/:brandId/guidelines/metadata', () => {
    it('401 anonymous', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer()).get(
        `/api/v1/brands/${brandId}/guidelines/metadata`,
      );
      expect(res.status).toBe(401);
    });

    it('403 viewer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', 'viewer');
      expect(res.status).toBe(403);
    });

    it('404 unknown brand', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(404);
    });

    it('200 auto-creates an empty record on first read', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        brandId,
        tags: [],
        lastUpdatedByUserId: `subject-${AUTH_ROLE_ADMIN}`,
      });
    });
  });

  describe('PUT /api/v1/brands/:brandId/guidelines/metadata', () => {
    it('401 anonymous', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .send({ tags: [] });
      expect(res.status).toBe(401);
    });

    it('403 viewer', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', 'viewer')
        .send({ tags: [] });
      expect(res.status).toBe(403);
    });

    it('404 unknown brand (valid body)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tags: ['en'] });
      expect(res.status).toBe(404);
    });

    it('400 unknown body key', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ owner: 'leak' });
      expect(res.status).toBe(400);
    });

    it('200 persists tags', async () => {
      const brandId = await createBrand(app, 'Acme');
      const res = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tags: ['campaign-spring', 'EN'] });
      expect(res.status).toBe(200);
      expect(res.body.data.tags).toEqual(['campaign-spring', 'EN']);
      expect(res.body.data.lastUpdatedByUserId).toBe(`subject-${AUTH_ROLE_ADMIN}`);
    });

    it('200 with empty tags clears existing tags', async () => {
      const brandId = await createBrand(app, 'Acme');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tags: ['en'] })
        .expect(200);
      const cleared = await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tags: [] });
      expect(cleared.body.data.tags).toEqual([]);
    });
  });
});
