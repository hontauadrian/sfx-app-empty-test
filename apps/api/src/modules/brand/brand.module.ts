import { Module } from '@nestjs/common';
import { prisma } from '@sfx/database';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandController } from './application/controllers/brand.controller';
import { BrandVoiceController } from './application/controllers/brand-voice.controller';
import { VisualIdentityController } from './application/controllers/visual-identity.controller';
import { CreateBrandPipe } from './application/pipes/create-brand.pipe';
import { RenameBrandPipe } from './application/pipes/rename-brand.pipe';
import { UpsertBrandVoicePipe } from './application/pipes/upsert-brand-voice.pipe';
import { UpsertVisualIdentityPipe } from './application/pipes/upsert-visual-identity.pipe';
import { BrandPrismaRepository } from './data/repositories/brand.repository';
import { BrandVoicePrismaRepository } from './data/repositories/brand-voice.repository';
import { VisualIdentityPrismaRepository } from './data/repositories/visual-identity.repository';
import { BRAND_REPOSITORY, PRISMA_CLIENT } from './data/repositories/brand.tokens';
import {
  BRAND_GUIDELINES_VERSION_REPOSITORY,
  BRAND_VOICE_REPOSITORY,
  VISUAL_IDENTITY_REPOSITORY,
} from './data/repositories/brand-guidelines.tokens';
import { BRAND_GUIDELINES_PRISMA_CLIENT } from '../brand-guidelines/data/repositories/brand-guidelines.tokens';
import { BrandGuidelinesVersionPrismaRepository } from '../brand-guidelines/data/repositories/brand-guidelines-version.repository';
import { ChangeNoteQueryPipe } from '../brand-guidelines/application/pipes/change-note-query.pipe';

@Module({
  controllers: [BrandController, BrandVoiceController, VisualIdentityController],
  providers: [
    AuthTokenService,
    JwtAuthGuard,
    CreateBrandPipe,
    RenameBrandPipe,
    UpsertBrandVoicePipe,
    UpsertVisualIdentityPipe,
    ChangeNoteQueryPipe,
    { provide: PRISMA_CLIENT, useValue: prisma },
    // BRAND_GUIDELINES_PRISMA_CLIENT is bound here so the version repository
    // (instantiated below) resolves its prisma dep without importing
    // BrandGuidelinesModule (which would create a near-circular dep).
    { provide: BRAND_GUIDELINES_PRISMA_CLIENT, useValue: prisma },
    { provide: BRAND_REPOSITORY, useClass: BrandPrismaRepository },
    { provide: BRAND_VOICE_REPOSITORY, useClass: BrandVoicePrismaRepository },
    { provide: VISUAL_IDENTITY_REPOSITORY, useClass: VisualIdentityPrismaRepository },
    {
      provide: BRAND_GUIDELINES_VERSION_REPOSITORY,
      useClass: BrandGuidelinesVersionPrismaRepository,
    },
  ],
})
export class BrandModule {}
