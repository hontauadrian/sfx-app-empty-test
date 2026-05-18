import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BrandModule } from '../brand.module';
import { BrandController } from '../application/controllers/brand.controller';
import { BrandVoiceController } from '../application/controllers/brand-voice.controller';
import { VisualIdentityController } from '../application/controllers/visual-identity.controller';
import { BrandPrismaRepository } from '../data/repositories/brand.repository';
import { BrandVoicePrismaRepository } from '../data/repositories/brand-voice.repository';
import { VisualIdentityPrismaRepository } from '../data/repositories/visual-identity.repository';
import {
  BRAND_REPOSITORY,
  PRISMA_CLIENT,
} from '../data/repositories/brand.tokens';
import {
  BRAND_VOICE_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
} from '../data/repositories/brand-guidelines.tokens';

describe('BrandModule', () => {
  it('registers controllers and binds repository + prisma tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), BrandModule],
    }).compile();

    expect(moduleRef.get(BrandController)).toBeInstanceOf(BrandController);
    expect(moduleRef.get(BrandVoiceController)).toBeInstanceOf(BrandVoiceController);
    expect(moduleRef.get(VisualIdentityController)).toBeInstanceOf(VisualIdentityController);

    expect(moduleRef.get(BRAND_REPOSITORY)).toBeInstanceOf(BrandPrismaRepository);
    expect(moduleRef.get(BRAND_VOICE_REPOSITORY)).toBeInstanceOf(BrandVoicePrismaRepository);
    expect(moduleRef.get(VISUAL_IDENTITY_REPOSITORY)).toBeInstanceOf(
      VisualIdentityPrismaRepository,
    );

    expect(moduleRef.get(PRISMA_CLIENT)).toBeDefined();

    await moduleRef.close();
  });
});
