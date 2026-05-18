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
  const response = await request(app.getHttpServer())
    .post('/api/v1/brands')
    .set('x-test-role', AUTH_ROLE_ADMIN)
    .send({ name })
    .expect(201);
  return response.body.data.id as string;
}

interface SearchGroup {
  section: string;
  items: { fragment: string }[];
}

function findGroup(body: { data: { groups: SearchGroup[] } }, section: string): SearchGroup | undefined {
  return body.data.groups.find((group) => group.section === section);
}

describe('Guideline search (integration)', () => {
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

  it('401 anonymous', async () => {
    const brandId = await createBrand(app, 'Acme');
    const response = await request(app.getHttpServer()).get(
      `/api/v1/brands/${brandId}/guidelines/search`,
    );
    expect(response.status).toBe(401);
  });

  it('403 viewer', async () => {
    const brandId = await createBrand(app, 'Acme');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/guidelines/search`)
      .set('x-test-role', 'viewer');
    expect(response.status).toBe(403);
  });

  it('404 unknown brand', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${UNKNOWN_BRAND}/guidelines/search`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(404);
  });

  it('200 empty query → empty groups', async () => {
    const brandId = await createBrand(app, 'Acme');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/guidelines/search`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ query: '', brandId, groups: [] });
  });

  it('200 finds matching D&D entry', async () => {
    const brandId = await createBrand(app, 'Acme');
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandId}/guidelines/dos-and-donts`)
      .set('x-test-role', AUTH_ROLE_ADMIN)
      .send({
        type: 'do',
        category: 'tone',
        ruleText: 'Always use the official wordmark in marketing.',
      })
      .expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/guidelines/search?q=wordmark`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(200);
    const group = findGroup(response.body, 'dos-and-donts');
    expect(group?.items.length).toBeGreaterThan(0);
    expect(group?.items[0]?.fragment.toLowerCase()).toContain('wordmark');
  });

  it('200 finds matching metadata tag', async () => {
    const brandId = await createBrand(app, 'Acme');
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/guidelines/metadata`)
      .set('x-test-role', AUTH_ROLE_ADMIN)
      .send({ tags: ['campaign-spring'] })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/guidelines/search?q=campaign`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(200);
    const group = findGroup(response.body, 'metadata');
    expect(group?.items.length).toBeGreaterThan(0);
  });

  it("cross-brand isolation: brand B's content does not appear when scoped to brand A", async () => {
    const brandA = await createBrand(app, 'Alpha');
    const brandB = await createBrand(app, 'Beta');
    await request(app.getHttpServer())
      .post(`/api/v1/brands/${brandB}/guidelines/dos-and-donts`)
      .set('x-test-role', AUTH_ROLE_ADMIN)
      .send({ type: 'do', category: 'tone', ruleText: 'Beta wordmark rule' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandA}/guidelines/search?q=wordmark`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.data.groups).toEqual([]);
  });

  it('400 q longer than 200 chars', async () => {
    const brandId = await createBrand(app, 'Acme');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/guidelines/search?q=${'x'.repeat(201)}`)
      .set('x-test-role', AUTH_ROLE_ADMIN);
    expect(response.status).toBe(400);
  });
});
