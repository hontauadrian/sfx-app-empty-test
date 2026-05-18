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

let createCounter = 0;
async function createBrand(baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-standalone-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

async function upsertVoice(
  app: INestApplication,
  brandId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await request(app.getHttpServer())
    .put(`/api/v1/brands/${brandId}/guidelines/voice`)
    .set('x-test-role', AUTH_ROLE_ADMIN)
    .send({ tone: 'Confident', ...body })
    .expect(200);
}

describe.sequential('Voice standalone reads (integration)', () => {
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

  describe('GET /api/v1/brands/:brandId/guidelines/voice/restricted-vocabulary', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/restricted-vocabulary`)
        .expect(401);
    });

    it('returns 403 for a non-admin caller', async () => {
      const brandId = await createBrand('VocabViewer');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/restricted-vocabulary`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when the brand does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/restricted-vocabulary`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns an empty array when no voice has been saved', async () => {
      const brandId = await createBrand('VocabEmpty');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/restricted-vocabulary`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('returns the restricted-vocabulary array (raw, no latestVersionId envelope)', async () => {
      const brandId = await createBrand('VocabFull');
      await upsertVoice(app, brandId, { restrictedVocabulary: ['cheap', 'guarantee'] });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/restricted-vocabulary`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual(['cheap', 'guarantee']);
      expect(response.body.data.latestVersionId).toBeUndefined();
    });
  });

  describe('GET /api/v1/brands/:brandId/guidelines/voice/approved-examples', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/approved-examples`)
        .expect(401);
    });

    it('returns 403 for a non-admin caller', async () => {
      const brandId = await createBrand('ApprovedViewer');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/approved-examples`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when the brand does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/approved-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns an empty array when no voice has been saved', async () => {
      const brandId = await createBrand('ApprovedEmpty');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/approved-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('returns the approved-examples array shape', async () => {
      const brandId = await createBrand('ApprovedFull');
      await upsertVoice(app, brandId, {
        approvedExamples: [{ phrase: 'Partner up.' }],
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/approved-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual([{ phrase: 'Partner up.' }]);
    });
  });

  describe('GET /api/v1/brands/:brandId/guidelines/voice/rejected-examples', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/rejected-examples`)
        .expect(401);
    });

    it('returns 403 for a non-admin caller', async () => {
      const brandId = await createBrand('RejectedViewer');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/rejected-examples`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when the brand does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/guidelines/voice/rejected-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns an empty array when no voice has been saved', async () => {
      const brandId = await createBrand('RejectedEmpty');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/rejected-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual([]);
    });

    it('returns the rejected-examples array shape (phrase + optional reason)', async () => {
      const brandId = await createBrand('RejectedFull');
      await upsertVoice(app, brandId, {
        rejectedExamples: [{ phrase: 'Cheap deal.', reason: 'Off-brand pricing language' }],
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice/rejected-examples`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.data).toEqual([
        { phrase: 'Cheap deal.', reason: 'Off-brand pricing language' },
      ]);
    });
  });
});
