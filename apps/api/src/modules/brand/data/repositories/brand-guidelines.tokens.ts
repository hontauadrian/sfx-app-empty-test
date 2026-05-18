export const BRAND_VOICE_REPOSITORY = Symbol('BRAND_VOICE_REPOSITORY');
export const VISUAL_IDENTITY_REPOSITORY = Symbol('VISUAL_IDENTITY_REPOSITORY');
// Symbol.for so BrandModule + BrandGuidelinesModule resolve the same key
// when binding the BrandGuidelinesVersion repository. Both modules
// instantiate BrandGuidelinesVersionPrismaRepository; the repository is
// stateless, so duplicate-binding is safe.
export const BRAND_GUIDELINES_VERSION_REPOSITORY = Symbol.for(
  'BrandGuidelinesVersionRepository',
);
