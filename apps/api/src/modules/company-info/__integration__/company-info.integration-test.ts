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
      const request = context.switchToHttp().getRequest<TestRequest>();
      const header = request.headers['x-test-role'];
      const role = Array.isArray(header) ? header[0] : header;

      if (!role) {
        throw new UnauthorizedException('Bearer token is required');
      }

      const requiredRoles =
        reflector.getAllAndOverride<string[]>(AUTH_ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];

      const userRoles = role === 'anonymous' ? [] : [role];
      if (
        requiredRoles.length > 0 &&
        !requiredRoles.some((r) => userRoles.includes(r))
      ) {
        throw new ForbiddenException('Missing required role');
      }

      request.user = {
        subject: `subject-${role}`,
        email: `${role}@example.test`,
        roles: userRoles,
      };
      return true;
    },
  };
}

describe('CompanyInfo module (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    await prisma.companyInfoVersion.deleteMany();
    await prisma.companyInfo.deleteMany();
  });

  afterAll(async () => {
    await prisma.companyInfoVersion.deleteMany();
    await prisma.companyInfo.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/company-info', () => {
    it('returns 401 when no bearer token is present', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/company-info');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ success: false, error: { statusCode: 401 } });
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info')
        .set('x-test-role', 'viewer');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ success: false, error: { statusCode: 403 } });
    });

    it('returns 200 + null envelope when admin calls with an empty table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: null });
    });

    it('returns 200 + the persisted record when admin calls after a PUT', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme Holdings SRL' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        legalName: 'Acme Holdings SRL',
        tradingName: null,
      });
    });
  });

  describe('PUT /api/v1/company-info', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .send({ legalName: 'Acme' })
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', 'viewer')
        .send({ legalName: 'Acme' })
        .expect(403);
    });

    it('returns 400 with a per-field error when legalName is missing', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        error: {
          statusCode: 400,
          message: 'Validation failed',
        },
      });
      expect(Array.isArray(res.body.error.errors)).toBe(true);
      expect(res.body.error.errors.some((e: { field: string }) => e.field === 'legalName')).toBe(true);
    });

    it('returns 400 when website is a non-URL non-empty string', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', website: 'not a url' });

      expect(res.status).toBe(400);
      expect(res.body.error.errors.some((e: { field: string }) => e.field === 'website')).toBe(true);
    });

    it('creates the singleton on first PUT and returns 200 with the persisted record', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Acme Holdings SRL',
          tradingName: 'Acme',
          email: 'hello@acme.example',
          website: 'https://acme.example',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        legalName: 'Acme Holdings SRL',
        tradingName: 'Acme',
        email: 'hello@acme.example',
        website: 'https://acme.example',
        country: null,
      });

      const row = await prisma.companyInfo.findFirst();
      expect(row).not.toBeNull();
      expect(row?.legalName).toBe('Acme Holdings SRL');
    });

    it('updates the same record on a second PUT (application-enforced singleton)', async () => {
      const first = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'First' })
        .expect(200);

      const firstId = first.body.data.id;

      const second = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Second', country: 'Romania' })
        .expect(200);

      expect(second.body.data.id).toBe(firstId);
      expect(second.body.data.legalName).toBe('Second');
      expect(second.body.data.country).toBe('Romania');

      const rows = await prisma.companyInfo.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(firstId);
    });

    it('treats explicit null as a clear and undefined as unchanged-omission', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Co', tradingName: 'Original', city: 'Bucharest' })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Co', tradingName: null })
        .expect(200);

      expect(cleared.body.data.tradingName).toBeNull();
      expect(cleared.body.data.city).toBe('Bucharest');
    });

    it('creates the singleton with every expanded field on first PUT', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Acme Holdings SRL',
          companyName: 'Acme Display',
          foundedYear: 1998,
          teamSize: 42,
          industry: 'Manufacturing',
          missionStatement: 'To delight customers.',
          visionStatement: 'To be the most trusted brand.',
          coreValues: ['Integrity', 'Craft'],
          certifications: ['ISO 9001', 'SOC 2'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        legalName: 'Acme Holdings SRL',
        companyName: 'Acme Display',
        foundedYear: 1998,
        teamSize: 42,
        industry: 'Manufacturing',
        missionStatement: 'To delight customers.',
        visionStatement: 'To be the most trusted brand.',
        coreValues: ['Integrity', 'Craft'],
        certifications: ['ISO 9001', 'SOC 2'],
      });

      const row = await prisma.companyInfo.findFirst();
      expect(row).not.toBeNull();
      expect(row?.companyName).toBe('Acme Display');
      expect(row?.foundedYear).toBe(1998);
      expect(row?.teamSize).toBe(42);
      expect(row?.industry).toBe('Manufacturing');
      expect(row?.coreValues).toEqual(['Integrity', 'Craft']);
      expect(row?.certifications).toEqual(['ISO 9001', 'SOC 2']);
    });

    it('returns 400 with a foundedYear path issue when foundedYear is non-integer', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', foundedYear: 1998.5 });

      expect(res.status).toBe(400);
      expect(
        res.body.error.errors.some((issue: { field: string }) => issue.field === 'foundedYear'),
      ).toBe(true);
    });

    it('returns 400 with a teamSize path issue when teamSize is negative', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', teamSize: -1 });

      expect(res.status).toBe(400);
      expect(
        res.body.error.errors.some((issue: { field: string }) => issue.field === 'teamSize'),
      ).toBe(true);
    });

    it('returns 400 with a coreValues path issue when coreValues has > 32 items', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Acme',
          coreValues: Array.from({ length: 33 }, (_unused, index) => `value${index}`),
        });

      expect(res.status).toBe(400);
      expect(
        res.body.error.errors.some((issue: { field: string }) =>
          issue.field.startsWith('coreValues'),
        ),
      ).toBe(true);
    });

    it('returns 400 with a coreValues.<idx> path issue when an item exceeds 200 chars', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', coreValues: ['ok', 'x'.repeat(201)] });

      expect(res.status).toBe(400);
      expect(
        res.body.error.errors.some((issue: { field: string }) =>
          issue.field.startsWith('coreValues'),
        ),
      ).toBe(true);
    });

    it('returns 400 when coreValues contains a non-string element', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', coreValues: ['ok', 12345] });

      expect(res.status).toBe(400);
    });

    it('returns 400 when missionStatement exceeds 4000 characters', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', missionStatement: 'x'.repeat(4001) });

      expect(res.status).toBe(400);
      expect(
        res.body.error.errors.some(
          (issue: { field: string }) => issue.field === 'missionStatement',
        ),
      ).toBe(true);
    });

    it('treats coreValues: [] as an explicit clear on a subsequent PUT', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', coreValues: ['A', 'B'] })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', coreValues: [] })
        .expect(200);

      expect(cleared.body.data.coreValues).toEqual([]);
    });

    it('treats coreValues omitted as unchanged on a subsequent PUT', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', coreValues: ['A', 'B'] })
        .expect(200);

      const second = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Acme', companyName: 'Renamed' })
        .expect(200);

      expect(second.body.data.coreValues).toEqual(['A', 'B']);
    });

    it("treats every new optional scalar's null as an explicit clear", async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Acme',
          companyName: 'Acme Display',
          foundedYear: 1998,
          teamSize: 42,
          industry: 'Manufacturing',
          missionStatement: 'M',
          visionStatement: 'V',
        })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Acme',
          companyName: null,
          foundedYear: null,
          teamSize: null,
          industry: null,
          missionStatement: null,
          visionStatement: null,
        })
        .expect(200);

      expect(cleared.body.data.companyName).toBeNull();
      expect(cleared.body.data.foundedYear).toBeNull();
      expect(cleared.body.data.teamSize).toBeNull();
      expect(cleared.body.data.industry).toBeNull();
      expect(cleared.body.data.missionStatement).toBeNull();
      expect(cleared.body.data.visionStatement).toBeNull();
    });
  });

  describe('PUT /api/v1/company-info — version side effect', () => {
    it('writes a CompanyInfoVersion row after a 200 PUT as admin', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Versioned Probe Co',
          companyName: 'VersionCo',
          coreValues: ['A', 'B'],
        })
        .expect(200);

      const versions = await prisma.companyInfoVersion.findMany();
      expect(versions).toHaveLength(1);
      const persisted = await prisma.companyInfo.findFirst();
      expect(persisted).not.toBeNull();
      const version = versions[0]!;
      expect(version.companyInfoId).toBe(persisted!.id);
      expect(version.editorUserId).toBe(`subject-${AUTH_ROLE_ADMIN}`);
      expect(version.editorDisplayName).toBe(`${AUTH_ROLE_ADMIN}@example.test`);
      const snapshot = version.snapshot as Record<string, unknown>;
      expect(snapshot.legalName).toBe('Versioned Probe Co');
      expect(snapshot.companyName).toBe('VersionCo');
      expect(snapshot.coreValues).toEqual(['A', 'B']);
    });

    it('writes a separate row per PUT, ordered newest-first by createdAt', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'First Name' })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Second Name' })
        .expect(200);

      const versions = await prisma.companyInfoVersion.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(versions).toHaveLength(2);
      expect((versions[0]!.snapshot as Record<string, unknown>).legalName).toBe('Second Name');
      expect((versions[1]!.snapshot as Record<string, unknown>).legalName).toBe('First Name');
    });

    it('does NOT write a version row when the PUT fails Zod validation', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({})
        .expect(400);

      expect(await prisma.companyInfoVersion.count()).toBe(0);
      expect(await prisma.companyInfo.count()).toBe(0);
    });
  });

  describe('GET /api/v1/company-info/versions', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer()).get('/api/v1/company-info/versions').expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions')
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 200 + empty page when admin calls on an empty table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { items: [], nextCursor: null } });
    });

    it('returns the versions newest-first with every documented field', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'First' })
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 10));

      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'Second' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);
      const items = res.body.data.items as Array<Record<string, unknown>>;
      const first = items[0]!;
      const second = items[1]!;
      expect(first).toMatchObject({
        id: expect.any(String),
        companyInfoId: expect.any(String),
        editorUserId: `subject-${AUTH_ROLE_ADMIN}`,
        editorDisplayName: `${AUTH_ROLE_ADMIN}@example.test`,
      });
      expect((first.snapshot as Record<string, unknown>).legalName).toBe('Second');
      expect((second.snapshot as Record<string, unknown>).legalName).toBe('First');
    });

    it('mirrors curated flow: two PUTs back-to-back, page 1 nextCursor populated, page 2 returns prior snapshot', async () => {
      // Mirrors sfx-webapp-boilerplate-1ef9:get-versions-pagination-roundtrip exactly.
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'A' })
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({ legalName: 'B' })
        .expect(200);

      const dbVersions = await prisma.companyInfoVersion.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(dbVersions).toHaveLength(2);

      const page1 = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?take=1')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(page1.status).toBe(200);
      expect(page1.body.data.items).toHaveLength(1);
      expect((page1.body.data.items[0].snapshot as Record<string, unknown>).legalName).toBe('B');
      expect(page1.body.data.nextCursor).not.toBeNull();
      expect(page1.body.data.nextCursor).toBe(page1.body.data.items[0].id);

      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/company-info/versions?take=1&cursor=${page1.body.data.nextCursor}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(page2.status).toBe(200);
      expect(page2.body.data.items).toHaveLength(1);
      expect((page2.body.data.items[0].snapshot as Record<string, unknown>).legalName).toBe('A');
    });

    it('paginates correctly with ?take=1 + follow-up cursor (no delay between PUTs)', async () => {
      for (const legalName of ['A', 'B', 'C']) {
        await request(app.getHttpServer())
          .put('/api/v1/company-info')
          .set('x-test-role', AUTH_ROLE_ADMIN)
          .send({ legalName })
          .expect(200);
      }

      const first = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?take=1')
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(first.status).toBe(200);
      expect(first.body.data.items).toHaveLength(1);
      expect((first.body.data.items[0].snapshot as Record<string, unknown>).legalName).toBe('C');
      expect(first.body.data.nextCursor).toBe(first.body.data.items[0].id);

      const second = await request(app.getHttpServer())
        .get(`/api/v1/company-info/versions?take=1&cursor=${first.body.data.nextCursor}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(second.status).toBe(200);
      expect(second.body.data.items).toHaveLength(1);
      expect((second.body.data.items[0].snapshot as Record<string, unknown>).legalName).toBe('B');
      expect(second.body.data.nextCursor).toBe(second.body.data.items[0].id);

      const third = await request(app.getHttpServer())
        .get(`/api/v1/company-info/versions?take=1&cursor=${second.body.data.nextCursor}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);
      expect(third.status).toBe(200);
      expect(third.body.data.items).toHaveLength(1);
      expect((third.body.data.items[0].snapshot as Record<string, unknown>).legalName).toBe('A');
      expect(third.body.data.nextCursor).toBeNull();
    });

    it('returns 400 when ?take=0', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?take=0')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

    it('returns 400 when ?take=101', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?take=101')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

    it('returns 400 when ?take=abc', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?take=abc')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

    it('returns 400 when ?cursor= (empty)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?cursor=')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });

    it('returns 200 + empty page when ?cursor=<unknown-id>', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?cursor=cl000000000000000000000000')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { items: [], nextCursor: null } });
    });

    it('returns 400 on unknown query keys (Zod .strict())', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions?foo=bar')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .expect(400);
    });
  });

  describe('GET /api/v1/company-info/versions/:id', () => {
    it('returns 401 when no bearer token is present', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions/cl000000000000000000000000')
        .expect(401);
    });

    it('returns 403 when an authenticated non-admin user calls the endpoint', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/company-info/versions/cl000000000000000000000000')
        .set('x-test-role', 'viewer')
        .expect(403);
    });

    it('returns 404 when admin requests a syntactically-valid but unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/company-info/versions/cl000000000000000000000000')
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        error: { statusCode: 404, message: 'Version not found' },
      });
    });

    it('returns 200 + the version envelope when admin requests a real id', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/company-info')
        .set('x-test-role', AUTH_ROLE_ADMIN)
        .send({
          legalName: 'Real Co',
          companyName: 'Real Display',
          coreValues: ['One', 'Two'],
        })
        .expect(200);

      const versionRow = await prisma.companyInfoVersion.findFirst();
      expect(versionRow).not.toBeNull();
      const id = versionRow!.id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/company-info/versions/${id}`)
        .set('x-test-role', AUTH_ROLE_ADMIN);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id,
        companyInfoId: expect.any(String),
        editorUserId: `subject-${AUTH_ROLE_ADMIN}`,
        editorDisplayName: `${AUTH_ROLE_ADMIN}@example.test`,
      });
      const snapshot = res.body.data.snapshot as Record<string, unknown>;
      expect(snapshot.legalName).toBe('Real Co');
      expect(snapshot.companyName).toBe('Real Display');
      expect(snapshot.coreValues).toEqual(['One', 'Two']);
    });
  });
});
