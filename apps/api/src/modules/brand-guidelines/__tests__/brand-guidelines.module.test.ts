import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { BrandGuidelinesModule } from '../brand-guidelines.module';
import {
  BRAND_METADATA_REPOSITORY,
  DOS_DONTS_REPOSITORY,
  GUIDELINE_SEARCH_REPOSITORY,
} from '../data/repositories/brand-guidelines.tokens';

describe('BrandGuidelinesModule', () => {
  it('resolves all three repository tokens via the DI container', async () => {
    process.env.OAUTH_ISSUER_URL ??= 'http://localhost:37385/realms/app';
    process.env.OAUTH_JWKS_URL ??= 'http://localhost:37385/realms/app/protocol/openid-connect/certs';
    process.env.OAUTH_API_CLIENT_ID ??= 'test-client';
    process.env.JWT_SECRET ??= 'integration-test-secret-key-32chars';

    const moduleRef = await Test.createTestingModule({
      imports: [BrandGuidelinesModule],
    }).compile();

    expect(moduleRef.get(DOS_DONTS_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(BRAND_METADATA_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(GUIDELINE_SEARCH_REPOSITORY)).toBeDefined();
    await moduleRef.close();
  });
});
