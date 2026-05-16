import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BRAND_PROFILE_REPOSITORY,
  BRAND_VOICE_REPOSITORY,
  type AudienceRule,
  type BrandProfile,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
  type BrandVoice,
  type BrandVoiceUpsertInput,
  type IBrandProfileRepository,
  type IBrandVoiceRepository,
} from '@sfx/domain';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { BrandVoiceController } from '../application/controllers/brand-voice.controller';

class InMemoryBrandProfileRepository implements IBrandProfileRepository {
  private readonly brands = new Map<string, BrandProfile>();
  private counter = 0;

  async listByOwner(ownerSubject: string): Promise<BrandProfile[]> {
    return Array.from(this.brands.values()).filter(
      (entry) => entry.ownerSubject === ownerSubject,
    );
  }
  async findById(id: string, ownerSubject: string): Promise<BrandProfile | null> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return null;
    return entry;
  }
  async create(input: BrandProfileCreateInput): Promise<BrandProfile> {
    this.counter += 1;
    const id = `brand-${this.counter}`;
    const now = new Date('2026-05-15T00:00:00.000Z');
    const brand: BrandProfile = {
      id,
      ownerSubject: input.ownerSubject,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
    };
    this.brands.set(id, brand);
    return brand;
  }
  async update(
    id: string,
    ownerSubject: string,
    patch: BrandProfileUpdatePatch,
  ): Promise<BrandProfile | null> {
    const current = this.brands.get(id);
    if (!current || current.ownerSubject !== ownerSubject) return null;
    const next: BrandProfile = {
      ...current,
      name: patch.name ?? current.name,
      description: 'description' in patch ? (patch.description ?? null) : current.description,
      updatedAt: new Date('2026-05-15T01:00:00.000Z'),
    };
    this.brands.set(id, next);
    return next;
  }
  async delete(id: string, ownerSubject: string): Promise<boolean> {
    const entry = this.brands.get(id);
    if (!entry || entry.ownerSubject !== ownerSubject) return false;
    this.brands.delete(id);
    return true;
  }
}

class InMemoryBrandVoiceRepository implements IBrandVoiceRepository {
  private readonly voices = new Map<string, BrandVoice>();
  private counter = 0;
  constructor(private readonly brands: InMemoryBrandProfileRepository) {}

  async findByBrand(
    brandProfileId: string,
    ownerSubject: string,
  ): Promise<BrandVoice | null> {
    const brand = await this.brands.findById(brandProfileId, ownerSubject);
    if (!brand) return null;
    return this.voices.get(brandProfileId) ?? null;
  }
  async upsertForBrand(
    brandProfileId: string,
    ownerSubject: string,
    payload: BrandVoiceUpsertInput,
  ): Promise<BrandVoice | null> {
    const brand = await this.brands.findById(brandProfileId, ownerSubject);
    if (!brand) return null;
    const now = new Date('2026-05-15T02:00:00.000Z');
    const existing = this.voices.get(brandProfileId);
    if (existing) {
      const next: BrandVoice = {
        ...existing,
        toneOfVoice: payload.toneOfVoice,
        preferredVocabulary: payload.preferredVocabulary,
        restrictedVocabulary: payload.restrictedVocabulary,
        messagingPillars: payload.messagingPillars,
        writingStyleRules: payload.writingStyleRules,
        audienceRules: payload.audienceRules as readonly AudienceRule[],
        approvedExamplePhrases: payload.approvedExamplePhrases,
        rejectedExamplePhrases: payload.rejectedExamplePhrases,
        updatedAt: now,
      };
      this.voices.set(brandProfileId, next);
      return next;
    }
    this.counter += 1;
    const created: BrandVoice = {
      id: `voice-${this.counter}`,
      brandProfileId,
      toneOfVoice: payload.toneOfVoice,
      preferredVocabulary: payload.preferredVocabulary,
      restrictedVocabulary: payload.restrictedVocabulary,
      messagingPillars: payload.messagingPillars,
      writingStyleRules: payload.writingStyleRules,
      audienceRules: payload.audienceRules as readonly AudienceRule[],
      approvedExamplePhrases: payload.approvedExamplePhrases,
      rejectedExamplePhrases: payload.rejectedExamplePhrases,
      createdAt: now,
      updatedAt: now,
    };
    this.voices.set(brandProfileId, created);
    return created;
  }
}

const ADMIN_USER = { subject: 'admin', email: 'admin@example.com', roles: ['viewer'] };
const VIEWER_USER = { subject: 'viewer', email: 'viewer@example.com', roles: ['viewer'] };

class StubAuthGuard {
  canActivate(context: { switchToHttp: () => { getRequest: <T>() => T } }): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: typeof ADMIN_USER;
    }>();
    const header = request.headers['authorization'];
    const token = Array.isArray(header) ? header[0] : header;
    if (token === 'Bearer admin') {
      request.user = ADMIN_USER;
      return true;
    }
    if (token === 'Bearer viewer') {
      request.user = VIEWER_USER;
      return true;
    }
    throw new UnauthorizedException('Bearer token is required');
  }
}

describe('BrandVoiceController (integration)', () => {
  let app: INestApplication;
  let brandRepo: InMemoryBrandProfileRepository;
  let voiceRepo: InMemoryBrandVoiceRepository;
  let brandId: string;

  beforeAll(async () => {
    brandRepo = new InMemoryBrandProfileRepository();
    voiceRepo = new InMemoryBrandVoiceRepository(brandRepo);
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [BrandVoiceController],
      providers: [
        { provide: BRAND_PROFILE_REPOSITORY, useValue: brandRepo },
        { provide: BRAND_VOICE_REPOSITORY, useValue: voiceRepo },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new StubAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(async () => {
    const brand = await brandRepo.create({
      ownerSubject: 'admin',
      name: 'Acme',
      description: null,
    });
    brandId = brand.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects anonymous requests with 401 on GET and PUT', async () => {
    const server = app.getHttpServer();
    await request(server).get(`/api/v1/brands/${brandId}/voice`).expect(401);
    await request(server).put(`/api/v1/brands/${brandId}/voice`).send({}).expect(401);
  });

  it('GET on owned brand without a voice row returns 200 with empty defaults', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        brandProfileId: brandId,
        toneOfVoice: null,
        preferredVocabulary: [],
        restrictedVocabulary: [],
        messagingPillars: [],
        writingStyleRules: [],
        audienceRules: [],
        approvedExamplePhrases: [],
        rejectedExamplePhrases: [],
        createdAt: null,
        updatedAt: null,
      },
    });
  });

  it('PUT with empty body upserts the empty payload and round-trips via GET', async () => {
    const put = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(200);
    expect(put.body.data.toneOfVoice).toBeNull();

    const get = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(get.body.data.toneOfVoice).toBeNull();
    expect(get.body.data.preferredVocabulary).toEqual([]);
  });

  it('PUT with a fully populated body round-trips every field', async () => {
    const populated = {
      toneOfVoice: 'Warm.',
      preferredVocabulary: ['craft', 'trust'],
      restrictedVocabulary: ['utilize'],
      messagingPillars: ['Trust'],
      writingStyleRules: ['Use active voice.'],
      audienceRules: [{ audience: 'Gen Z', rule: 'Peer-to-peer.' }],
      approvedExamplePhrases: ['Hi'],
      rejectedExamplePhrases: ['Hey'],
    };
    const put = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send(populated)
      .expect(200);
    expect(put.body.data).toMatchObject(populated);

    const get = await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .expect(200);
    expect(get.body.data).toMatchObject(populated);
  });

  it('PUT is idempotent — sending the same body twice returns 200 both times', async () => {
    const body = { toneOfVoice: 'Tone.', preferredVocabulary: ['x'] };
    const first = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send(body)
      .expect(200);
    const second = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send(body)
      .expect(200);
    expect(first.body.data.toneOfVoice).toBe('Tone.');
    expect(second.body.data.toneOfVoice).toBe('Tone.');
  });

  it('PUT with a case-insensitive duplicate vocabulary returns 400', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({ preferredVocabulary: ['foo', 'FOO'] })
      .expect(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.statusCode).toBe(400);
  });

  it('PUT with an empty list item returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({ preferredVocabulary: ['   '] })
      .expect(400);
  });

  it('PUT with toneOfVoice exceeding the max length returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({ toneOfVoice: 'a'.repeat(5000) })
      .expect(400);
  });

  it('PUT with a duplicate audience case-insensitive returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({
        audienceRules: [
          { audience: 'a', rule: 'x' },
          { audience: 'A', rule: 'y' },
        ],
      })
      .expect(400);
  });

  it('cross-tenant GET returns 404', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer viewer')
      .expect(404);
  });

  it('cross-tenant PUT returns 404', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer viewer')
      .send({ toneOfVoice: 'sneak' })
      .expect(404);
  });

  it('GET on a missing brand id returns 404', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/brands/missing/voice')
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });

  it('PUT on a missing brand id returns 404', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/brands/missing/voice')
      .set('Authorization', 'Bearer admin')
      .send({})
      .expect(404);
  });

  it('after the brand is deleted the voice GET returns 404 (cascade boundary)', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .send({ toneOfVoice: 'Tone.' })
      .expect(200);
    await brandRepo.delete(brandId, 'admin');
    await request(app.getHttpServer())
      .get(`/api/v1/brands/${brandId}/voice`)
      .set('Authorization', 'Bearer admin')
      .expect(404);
  });
});
