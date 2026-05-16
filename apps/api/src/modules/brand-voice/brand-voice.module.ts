import { Module, type Provider } from '@nestjs/common';
import { BRAND_VOICE_REPOSITORY } from '@sfx/domain';
import { prisma } from '@sfx/database';
import { AuthModule } from '../auth/auth.module';
import { BrandProfileModule } from '../brand-profile/brand-profile.module';
import { BrandVoiceController } from './application/controllers/brand-voice.controller';
import { BrandVoiceRepository } from './data/repositories/brand-voice.repository';
import { PRISMA_CLIENT } from './infrastructure/prisma-client.token';

const prismaProvider: Provider = {
  provide: PRISMA_CLIENT,
  useValue: prisma,
};

const repositoryProvider: Provider = {
  provide: BRAND_VOICE_REPOSITORY,
  useClass: BrandVoiceRepository,
};

@Module({
  imports: [AuthModule, BrandProfileModule],
  controllers: [BrandVoiceController],
  providers: [prismaProvider, repositoryProvider, BrandVoiceRepository],
})
export class BrandVoiceModule {}
