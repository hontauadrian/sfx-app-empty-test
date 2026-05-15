import { Module, type Provider } from '@nestjs/common';
import { BRAND_PROFILE_REPOSITORY } from '@sfx/domain';
import { prisma } from '@sfx/database';
import { AuthModule } from '../auth/auth.module';
import { BrandProfileController } from './application/controllers/brand-profile.controller';
import { BrandProfileRepository } from './data/repositories/brand-profile.repository';
import { PRISMA_CLIENT } from './infrastructure/prisma-client.token';

const prismaProvider: Provider = {
  provide: PRISMA_CLIENT,
  useValue: prisma,
};

const repositoryProvider: Provider = {
  provide: BRAND_PROFILE_REPOSITORY,
  useClass: BrandProfileRepository,
};

@Module({
  imports: [AuthModule],
  controllers: [BrandProfileController],
  providers: [prismaProvider, repositoryProvider, BrandProfileRepository],
})
export class BrandProfileModule {}
