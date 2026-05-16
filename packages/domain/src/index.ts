// @sfx/domain — shared business entities and repository interfaces.
export type { BrandProfile } from './entities/brand-profile';
export {
  BRAND_PROFILE_REPOSITORY,
  type IBrandProfileRepository,
  type BrandProfileCreateInput,
  type BrandProfileUpdatePatch,
} from './contracts/brand-profile-repository';
export type { BrandVoice, AudienceRule } from './entities/brand-voice';
export {
  BRAND_VOICE_REPOSITORY,
  type IBrandVoiceRepository,
  type BrandVoiceUpsertInput,
} from './contracts/brand-voice-repository';
export type {
  VisualIdentity,
  VisualIdentityColourPaletteEntry,
  VisualIdentityTypographyRule,
} from './entities/visual-identity';
export {
  VISUAL_IDENTITY_REPOSITORY,
  type IVisualIdentityRepository,
  type VisualIdentityWritePayload,
} from './contracts/visual-identity-repository';
