import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CompanyInfoModule } from '../company-info.module';
import { CompanyInfoController } from '../application/controllers/company-info.controller';
import { CompanyInfoPrismaRepository } from '../data/repositories/company-info.repository';
import {
  COMPANY_INFO_REPOSITORY,
  PRISMA_CLIENT,
} from '../data/repositories/company-info.tokens';

describe('CompanyInfoModule', () => {
  it('registers the controller and binds repository + prisma tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), CompanyInfoModule],
    }).compile();

    const controller = moduleRef.get(CompanyInfoController);
    expect(controller).toBeInstanceOf(CompanyInfoController);

    const repo = moduleRef.get(COMPANY_INFO_REPOSITORY);
    expect(repo).toBeInstanceOf(CompanyInfoPrismaRepository);

    const prismaProvider = moduleRef.get(PRISMA_CLIENT);
    expect(prismaProvider).toBeDefined();

    await moduleRef.close();
  });
});
