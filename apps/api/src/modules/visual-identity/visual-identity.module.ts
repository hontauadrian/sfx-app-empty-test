import { Module, type Provider } from '@nestjs/common';
import { VISUAL_IDENTITY_REPOSITORY } from '@sfx/domain';
import { prisma } from '@sfx/database';
import { AuthModule } from '../auth/auth.module';
import { BrandProfileModule } from '../brand-profile/brand-profile.module';
import { VisualIdentityController } from './application/controllers/visual-identity.controller';
import { VisualIdentityRepository } from './data/repositories/visual-identity.repository';
import { PRISMA_CLIENT } from './infrastructure/prisma-client.token';

const prismaProvider: Provider = {
  provide: PRISMA_CLIENT,
  useValue: prisma,
};

const repositoryProvider: Provider = {
  provide: VISUAL_IDENTITY_REPOSITORY,
  useClass: VisualIdentityRepository,
};

@Module({
  imports: [AuthModule, BrandProfileModule],
  controllers: [VisualIdentityController],
  providers: [prismaProvider, repositoryProvider, VisualIdentityRepository],
})
export class VisualIdentityModule {}
