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

let createCounter = 0;
async function createBrand(baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-snapshot-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

async function countVersions(brandId: string): Promise<number> {
  return prisma.brandGuidelinesVersion.count({ where: { brandId } });
}

describe.sequential('Snapshot-on-mutate (integration)', () => {
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

  describe('PUT /api/v1/brands/:brandId/guidelines/voice', () => {
    it('inserts exactly one BrandGuidelinesVersion row per upsert', async () => {
      const brandId = await createBrand('VoiceSnap');
      expect(await countVersions(brandId)).toBe(0);
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Warm and direct' })
        .expect(200);
      expect(await countVersions(brandId)).toBe(1);
    });

    it('records the optional changeNote query on the new version row', async () => {
      const brandId = await createBrand('VoiceNote');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice?changeNote=tone%20tightening`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Warm and direct' })
        .expect(200);
      const versions = await prisma.brandGuidelinesVersion.findMany({ where: { brandId } });
      expect(versions).toHaveLength(1);
      expect(versions[0]?.changeNote).toBe('tone tightening');
    });

    it('captures voice in the version snapshot json', async () => {
      const brandId = await createBrand('VoiceSnapshot');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Confident' })
        .expect(200);
      const version = await prisma.brandGuidelinesVersion.findFirst({ where: { brandId } });
      expect(version).not.toBeNull();
      const snapshot = version!.snapshot as { voice: { tone?: string } | null };
      expect(snapshot.voice).not.toBeNull();
      expect(snapshot.voice!.tone).toBe('Confident');
    });
  });

  describe('PUT /api/v1/brands/:brandId/guidelines/visual', () => {
    it('inserts exactly one BrandGuidelinesVersion row per upsert', async () => {
      const brandId = await createBrand('VisualSnap');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ logoUsage: 'Primary mark only' })
        .expect(200);
      expect(await countVersions(brandId)).toBe(1);
    });
  });

  describe('PUT /api/v1/brands/:brandId/guidelines/metadata', () => {
    it('inserts a version row when metadata is upserted', async () => {
      const brandId = await createBrand('MetaSnap');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tags: ['en', 'campaign'] })
        .expect(200);
      expect(await countVersions(brandId)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/v1/brands/:brandId/guidelines/dos-and-donts', () => {
    it('inserts a version row when an entry is created', async () => {
      const brandId = await createBrand('DDSnapCreate');
      await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'Be concise' })
        .expect(201);
      expect(await countVersions(brandId)).toBe(1);
    });
  });

  describe('PATCH /api/v1/brands/:brandId/guidelines/dos-and-donts/:entryId', () => {
    it('inserts a version row when an entry is updated', async () => {
      const brandId = await createBrand('DDSnapUpdate');
      const created = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'Initial' })
        .expect(201);
      const entryId = created.body.data.id as string;
      expect(await countVersions(brandId)).toBe(1);
      await request(app.getHttpServer())
        .patch(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${entryId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ ruleText: 'Updated' })
        .expect(200);
      expect(await countVersions(brandId)).toBe(2);
    });
  });

  describe('DELETE /api/v1/brands/:brandId/guidelines/dos-and-donts/:entryId', () => {
    it('inserts a version row when an entry is deleted', async () => {
      const brandId = await createBrand('DDSnapDelete');
      const created = await request(app.getHttpServer())
        .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ type: 'do', category: 'tone', ruleText: 'Delete me' })
        .expect(201);
      const entryId = created.body.data.id as string;
      expect(await countVersions(brandId)).toBe(1);
      await request(app.getHttpServer())
        .delete(`/api/v1/brands/${brandId}/guidelines/dos-and-donts/${entryId}`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(204);
      expect(await countVersions(brandId)).toBe(2);
    });
  });

  describe('GET endpoints (latestVersionId is returned alongside the resource)', () => {
    it('voice GET returns the id of the latest version after an upsert', async () => {
      const brandId = await createBrand('VoiceLatest');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ tone: 'Direct' })
        .expect(200);
      const latest = await prisma.brandGuidelinesVersion.findFirst({
        where: { brandId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data.latestVersionId).toBe(latest?.id);
    });
  });
});
