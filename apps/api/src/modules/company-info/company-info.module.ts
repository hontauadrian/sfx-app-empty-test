import { Module } from '@nestjs/common';
import { prisma } from '@sfx/database';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyInfoController } from './application/controllers/company-info.controller';
import { ListCompanyInfoVersionsQueryPipe } from './application/pipes/list-company-info-versions-query.pipe';
import { UpsertCompanyInfoPipe } from './application/pipes/upsert-company-info.pipe';
import { CompanyInfoPrismaRepository } from './data/repositories/company-info.repository';
import {
  COMPANY_INFO_REPOSITORY,
  PRISMA_CLIENT,
} from './data/repositories/company-info.tokens';

@Module({
  controllers: [CompanyInfoController],
  providers: [
    AuthTokenService,
    JwtAuthGuard,
    UpsertCompanyInfoPipe,
    ListCompanyInfoVersionsQueryPipe,
    { provide: PRISMA_CLIENT, useValue: prisma },
    { provide: COMPANY_INFO_REPOSITORY, useClass: CompanyInfoPrismaRepository },
  ],
})
export class CompanyInfoModule {}
