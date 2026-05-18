import './setup-env';
import 'reflect-metadata';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
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
const UNKNOWN_VERSION_ID = 'clxbgvunknown000000000';

let createCounter = 0;
async function createBrand(baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-versions-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

async function seedVersion(
  brandId: string,
  overrides: Partial<{
    editorUserId: string;
    editorDisplayName: string;
    changeNote: string | null;
    createdAt: Date;
  }> = {},
): Promise<{ id: string; createdAt: Date }> {
  const row = await prisma.brandGuidelinesVersion.create({
    data: {
      brandId,
      snapshot: { voice: null, visual: null, dosAndDonts: [], metadata: null },
      editorUserId: overrides.editorUserId ?? `subject-${AUTH_ROLE_ADMIN}`,
      editorDisplayName: overrides.editorDisplayName ?? `${AUTH_ROLE_ADMIN}@example.test`,
      changeNote: overrides.changeNote ?? null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  });
  return { id: row.id, createdAt: row.createdAt };
}

describe.sequential('BrandGuidelinesVersions (integration)', () => {
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

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/brands/:brandId/guidelines/versions', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/versions`)
        .expect(401);
    });

    it('returns 403 for a non-admin caller', async () => {
      const brandId = await createBrand('Alpha');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when the brand does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/versions`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 200 with an empty page when no versions exist', async () => {
      const brandId = await createBrand('Empty');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.nextCursor).toBeNull();
    });

    it('returns versions newest-first', async () => {
      const brandId = await createBrand('Listed');
      const earlier = await seedVersion(brandId, {
        createdAt: new Date('2026-05-15T10:00:00.000Z'),
      });
      const later = await seedVersion(brandId, {
        createdAt: new Date('2026-05-17T10:00:00.000Z'),
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
      expect(ids[0]).toBe(later.id);
      expect(ids[1]).toBe(earlier.id);
    });

    it('paginates with take + cursor', async () => {
      const brandId = await createBrand('Paged');
      const seeded: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const version = await seedVersion(brandId, {
          createdAt: new Date(2026, 4, 17, 10, index),
        });
        seeded.push(version.id);
      }
      const firstPage = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions?take=2`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(firstPage.body.data.items).toHaveLength(2);
      const cursor = firstPage.body.data.nextCursor as string;
      expect(cursor).not.toBeNull();
      const secondPage = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions?take=2&cursor=${cursor}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(secondPage.body.data.items).toHaveLength(1);
      expect(secondPage.body.data.nextCursor).toBeNull();
    });

    it('returns 200 + empty page when cursor is unknown (Linear semantics)', async () => {
      const brandId = await createBrand('UnknownCursor');
      await seedVersion(brandId);
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/brands/${brandId}/guidelines/versions?cursor=clxbgvbogus0000000000`,
        )
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.nextCursor).toBeNull();
    });

    it('returns 200 + empty page when cursor is present but the brand is unknown (opaque cursor)', async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/versions?cursor=clxbgvbogus0000000000`,
        )
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data.items).toEqual([]);
      expect(response.body.data.nextCursor).toBeNull();
    });

    it('returns 400 on invalid take', async () => {
      const brandId = await createBrand('BadTake');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions?take=0`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

    it('returns 400 on unknown query key (.strict)', async () => {
      const brandId = await createBrand('UnknownKey');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions?bogus=1`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

  });

  describe('GET /api/v1/brands/:brandId/guidelines/versions/:versionId', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/versions/${UNKNOWN_VERSION_ID}`,
        )
        .expect(401);
    });

    it('returns 403 for a non-admin caller', async () => {
      const brandId = await createBrand('SingleViewer');
      const version = await seedVersion(brandId);
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions/${version.id}`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when the brand does not exist', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/versions/${UNKNOWN_VERSION_ID}`,
        )
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 404 when the version does not exist for an existing brand', async () => {
      const brandId = await createBrand('NoVersion');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions/${UNKNOWN_VERSION_ID}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 404 on cross-brand version lookup (no leak)', async () => {
      const brandA = await createBrand('OwnerA');
      const brandB = await createBrand('OwnerB');
      const versionA = await seedVersion(brandA);
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandB}/guidelines/versions/${versionA.id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 200 with the version row when brand + version match', async () => {
      const brandId = await createBrand('Found');
      const version = await seedVersion(brandId, { changeNote: 'first save' });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/versions/${version.id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toMatchObject({
        id: version.id,
        brandId,
        changeNote: 'first save',
        editorUserId: `subject-${AUTH_ROLE_ADMIN}`,
      });
      expect(response.body.data.snapshot).toMatchObject({
        voice: null,
        visual: null,
        dosAndDonts: [],
        metadata: null,
      });
    });
  });
});
