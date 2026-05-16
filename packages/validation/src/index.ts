// IMPORTANT: import `./openapi` first for the side-effect of extending Zod
// with `.openapi()` before any schema is defined downstream.
export { zodToOpenApi, zodApiBody, getOpenApiSchemas } from './openapi';

export { paginationSchema } from './schemas/common.schema';
export type { PaginationInput } from './schemas/common.schema';
export { idParamSchema } from './schemas/common.schema';
export type { IdParamInput } from './schemas/common.schema';

export {
  BRAND_NAME_MIN_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  BRAND_DESCRIPTION_MAX_LENGTH,
  brandProfileWriteSchema,
  brandProfileSchema,
} from './schemas/brand-profile.schema';
export type {
  BrandProfileWriteInput,
  BrandProfileShape,
} from './schemas/brand-profile.schema';

export {
  VISUAL_IDENTITY_LONG_TEXT_MAX_LENGTH,
  VISUAL_IDENTITY_LIST_ITEM_TEXT_MAX_LENGTH,
  VISUAL_IDENTITY_LIST_MAX_ITEMS,
  VISUAL_IDENTITY_HEX_PATTERN,
  visualIdentityWriteSchema,
  visualIdentitySchema,
} from './schemas/visual-identity.schema';
export type {
  VisualIdentityWriteInput,
  VisualIdentityShape,
  VisualIdentityColourPaletteEntry,
  VisualIdentityTypographyRule,
} from './schemas/visual-identity.schema';

export {
  BRAND_VOICE_TONE_MAX_LENGTH,
  BRAND_VOICE_LIST_ITEM_SHORT_MAX_LENGTH,
  BRAND_VOICE_LIST_ITEM_LONG_MAX_LENGTH,
  BRAND_VOICE_AUDIENCE_MAX_LENGTH,
  BRAND_VOICE_PHRASE_MAX_LENGTH,
  BRAND_VOICE_VOCAB_MAX_ITEMS,
  BRAND_VOICE_PILLARS_MAX_ITEMS,
  BRAND_VOICE_RULES_MAX_ITEMS,
  BRAND_VOICE_AUDIENCE_RULES_MAX_ITEMS,
  BRAND_VOICE_PHRASES_MAX_ITEMS,
  brandVoiceWriteSchema,
  brandVoiceSchema,
} from './schemas/brand-voice.schema';
export type {
  BrandVoiceWriteInput,
  BrandVoiceShape,
} from './schemas/brand-voice.schema';

export {
  DOS_AND_DONT_TYPE_VALUES,
  DOS_AND_DONT_CATEGORY_VALUES,
  DOS_AND_DONT_TITLE_MAX_LENGTH,
  DOS_AND_DONT_BODY_MAX_LENGTH,
  dosAndDontWriteSchema,
  dosAndDontSchema,
  dosAndDontListQuerySchema,
} from './schemas/dos-and-donts.schema';
export type {
  DosAndDontType,
  DosAndDontCategory,
  DosAndDontWriteInput,
  DosAndDontShape,
  DosAndDontListQueryInput,
} from './schemas/dos-and-donts.schema';
