// @sfx/domain — shared business entities and repository interfaces.
export type { BrandProfile } from './entities/brand-profile';
export {
  BRAND_PROFILE_REPOSITORY,
  type IBrandProfileRepository,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
} from './contracts/brand-profile-repository';
