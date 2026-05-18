import { Module } from '@nestjs/common';
import { prisma } from '@sfx/database';
import { AuthTokenService } from '../../common/auth/auth-token.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BrandPrismaRepository } from '../brand/data/repositories/brand.repository';
import { BRAND_REPOSITORY } from '../brand/data/repositories/brand.tokens';
import { BrandGuidelinesVersionsController } from './application/controllers/brand-guidelines-versions.controller';
import { BrandMetadataController } from './application/controllers/brand-metadata.controller';
import { DosAndDontsController } from './application/controllers/dos-and-donts.controller';
import { GuidelineSearchController } from './application/controllers/guideline-search.controller';
import { ChangeNoteQueryPipe } from './application/pipes/change-note-query.pipe';
import { CreateDosDontsEntryPipe } from './application/pipes/create-dos-donts-entry.pipe';
import { GuidelineSearchQueryPipe } from './application/pipes/guideline-search-query.pipe';
import { ListBrandGuidelinesVersionsQueryPipe } from './application/pipes/list-brand-guidelines-versions-query.pipe';
import { ListDosDontsQueryPipe } from './application/pipes/list-dos-donts-query.pipe';
import { UpdateDosDontsEntryPipe } from './application/pipes/update-dos-donts-entry.pipe';
import { UpsertBrandMetadataPipe } from './application/pipes/upsert-brand-metadata.pipe';
import { BrandGuidelinesVersionPrismaRepository } from './data/repositories/brand-guidelines-version.repository';
import { BrandMetadataPrismaRepository } from './data/repositories/brand-metadata.repository';
import { DosDontsPrismaRepository } from './data/repositories/dos-and-donts.repository';
import { GuidelineSearchPrismaRepository } from './data/repositories/guideline-search.repository';
import {
  BRAND_GUIDELINES_PRISMA_CLIENT,
  BRAND_METADATA_REPOSITORY,
  DOS_DONTS_REPOSITORY,
  GUIDELINE_SEARCH_REPOSITORY,
} from './data/repositories/brand-guidelines.tokens';
import { BRAND_GUIDELINES_VERSION_REPOSITORY } from '../brand/data/repositories/brand-guidelines.tokens';

// Local BRAND_REPOSITORY provider — Chunk A's BrandModule does not export the
// token in its `exports: []` array, and its module file is out of scope for
// Chunk C. Constructing BrandPrismaRepository directly (passing the singleton
// prisma client) gives this module a read-only view of the brand surface
// without touching brand.module.ts. The @Inject decorator on the repository
// constructor is metadata for the DI container — `new` with an explicit
// argument bypasses it cleanly.
@Module({
  controllers: [
    DosAndDontsController,
    BrandMetadataController,
    GuidelineSearchController,
    BrandGuidelinesVersionsController,
  ],
  providers: [
    AuthTokenService,
    JwtAuthGuard,
    CreateDosDontsEntryPipe,
    UpdateDosDontsEntryPipe,
    ListDosDontsQueryPipe,
    UpsertBrandMetadataPipe,
    GuidelineSearchQueryPipe,
    ListBrandGuidelinesVersionsQueryPipe,
    ChangeNoteQueryPipe,
    { provide: BRAND_GUIDELINES_PRISMA_CLIENT, useValue: prisma },
    {
      provide: BRAND_REPOSITORY,
      useFactory: (): BrandPrismaRepository => new BrandPrismaRepository(prisma),
    },
    { provide: DOS_DONTS_REPOSITORY, useClass: DosDontsPrismaRepository },
    { provide: BRAND_METADATA_REPOSITORY, useClass: BrandMetadataPrismaRepository },
    { provide: GUIDELINE_SEARCH_REPOSITORY, useClass: GuidelineSearchPrismaRepository },
    {
      provide: BRAND_GUIDELINES_VERSION_REPOSITORY,
      useClass: BrandGuidelinesVersionPrismaRepository,
    },
  ],
})
export class BrandGuidelinesModule {}
