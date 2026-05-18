import type {
  BrandGuidelinesVersion,
  ListBrandGuidelinesVersionsInput,
  ListBrandGuidelinesVersionsResult,
} from '../entities/brand-guidelines-version';

export interface BrandGuidelinesVersionRepository {
  list(input: ListBrandGuidelinesVersionsInput): Promise<ListBrandGuidelinesVersionsResult>;
  findById(id: string): Promise<BrandGuidelinesVersion | null>;
  findLatestForBrand(brandId: string): Promise<BrandGuidelinesVersion | null>;
}
