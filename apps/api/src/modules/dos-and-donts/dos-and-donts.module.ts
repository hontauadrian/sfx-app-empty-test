import { Module, type Provider } from '@nestjs/common';
import { DOS_AND_DONT_REPOSITORY } from '@sfx/domain';
import { prisma } from '@sfx/database';
import { AuthModule } from '../auth/auth.module';
import { BrandProfileModule } from '../brand-profile/brand-profile.module';
import { DosAndDontController } from './application/controllers/dos-and-dont.controller';
import { DosAndDontRepository } from './data/repositories/dos-and-dont.repository';
import { PRISMA_CLIENT } from './infrastructure/prisma-client.token';

const prismaProvider: Provider = {
  provide: PRISMA_CLIENT,
  useValue: prisma,
};

const repositoryProvider: Provider = {
  provide: DOS_AND_DONT_REPOSITORY,
  useClass: DosAndDontRepository,
};

@Module({
  imports: [AuthModule, BrandProfileModule],
  controllers: [DosAndDontController],
  providers: [prismaProvider, repositoryProvider, DosAndDontRepository],
})
export class DosAndDontsModule {}
