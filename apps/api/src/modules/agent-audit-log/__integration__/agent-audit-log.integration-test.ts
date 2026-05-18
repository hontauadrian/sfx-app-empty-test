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
import { AUTH_ROLE_ADMIN, AUTH_ROLE_AGENT } from '@sfx/shared';
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
      // Bind the user BEFORE the role check so the AgentAuditMiddleware's
      // res.on('finish') hook can still attribute rejected requests.
      incoming.user = {
        subject: `subject-${role}`,
        email: `${role}@example.test`,
        roles: userRoles,
      };
      if (
        requiredRoles.length > 0 &&
        !requiredRoles.some((needed) => userRoles.includes(needed))
      ) {
        throw new ForbiddenException('Missing required role');
      }
      return true;
    },
  };
}

const UNKNOWN_BRAND_ID = 'clxbrandunknown00000000';

let createCounter = 0;
async function createBrand(baseName: string): Promise<string> {
  createCounter += 1;
  const tag = `${baseName}-audit-${Date.now()}-${createCounter}`.toLowerCase();
  const row = await prisma.brand.create({
    data: { name: tag, slug: tag, ownerUserId: `subject-${AUTH_ROLE_ADMIN}` },
  });
  return row.id;
}

describe.sequential('AgentAuditLog (integration)', () => {
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

  describe('GET /api/v1/brands/:brandId/agent-audit-log', () => {
    it('returns 401 with no bearer token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/agent-audit-log`)
        .expect(401);
    });

    it('returns 403 for viewer role', async () => {
      const brandId = await createBrand('viewer-denied');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 403 for agent role (admin-only surface)', async () => {
      const brandId = await createBrand('agent-denied');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_AGENT)
        .expect(403);
    });

    it('returns 404 for an unknown brand', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${UNKNOWN_BRAND_ID}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(404);
    });

    it('returns 200 with an empty envelope on a fresh brand', async () => {
      const brandId = await createBrand('empty-audit');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.items).toEqual([]);
    });
  });

  describe('AgentAuditInterceptor', () => {
    it('inserts an audit row for an agent-authenticated read', async () => {
      const brandId = await createBrand('audit-on-read');
      await request(app.getHttpServer())
        .get('/api/v1/brands')
        .set('x-test-role', AUTH_ROLE_AGENT)
        .expect(200);

      // The admin audit-log listing is scoped per-brand. Since /brands list is
      // unscoped, write a brand-scoped agent read so the row attaches to a
      // known brandId for admin visibility.
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_AGENT)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const items = response.body.data.items as Array<{
        endpointPath: string;
        clientId: string;
        responseStatus: number;
        brandId: string;
      }>;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(
        items.some(
          (row) =>
            row.endpointPath ===
              `/api/v1/brands/${brandId}/guidelines/voice` &&
            row.brandId === brandId &&
            row.responseStatus === 200,
        ),
      ).toBe(true);
    });

    it('does NOT insert audit rows for admin-authenticated reads', async () => {
      const brandId = await createBrand('admin-no-audit');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const items = response.body.data.items as unknown[];
      expect(items).toEqual([]);
    });

    it('records 403 status when agent attempts a write', async () => {
      const brandId = await createBrand('agent-write-403');
      await request(app.getHttpServer())
        .put(`/api/v1/brands/${brandId}/guidelines/voice`)
        .set('x-test-role', AUTH_ROLE_AGENT)
        .send({ tone: 'Friendly' })
        .expect(403);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const items = response.body.data.items as Array<{
        endpointPath: string;
        responseStatus: number;
      }>;
      expect(
        items.some(
          (row) =>
            row.endpointPath === `/api/v1/brands/${brandId}/guidelines/voice` &&
            row.responseStatus === 403,
        ),
      ).toBe(true);
    });
  });

  describe('filters', () => {
    it('filters by clientId substring', async () => {
      const brandId = await createBrand('audit-filter-client');
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_AGENT)
        .set('x-client-id', 'agent-alpha-001')
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/guidelines/visual`)
        .set('x-test-role', AUTH_ROLE_AGENT)
        .set('x-client-id', 'agent-beta-001')
        .expect(200);
      const response = await request(app.getHttpServer())
        .get(`/api/v1/brands/${brandId}/agent-audit-log?clientId=alpha`)
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(200);
      const items = response.body.data.items as Array<{ clientId: string }>;
      expect(items.every((row) => row.clientId.includes('alpha'))).toBe(true);
      expect(items.some((row) => row.clientId === 'agent-alpha-001')).toBe(true);
    });

    it('rejects from > to with 400', async () => {
      const brandId = await createBrand('audit-bad-range');
      await request(app.getHttpServer())
        .get(
          `/api/v1/brands/${brandId}/agent-audit-log?from=2026-05-18T00:00:00.000Z&to=2026-05-01T00:00:00.000Z`,
        )
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });
  });
});
