// Web-local mirror of the @sfx/domain runtime enums.
//
// Next.js transpilePackages + SWC's barrel optimizer intermittently
// tree-shakes the value re-exports from `@sfx/domain/src/index.ts` (which
// mixes `export type {}` and `export {}` blocks), leaving the constants
// `undefined` at runtime. Mirroring the small enums here forces a stable
// webpack chunk for the brand-shell feature.
//
// Source of truth: `packages/domain/src/entities/dos-donts-entry.ts` +
// `packages/domain/src/ports/guideline-search-repository.ts`. Adding a value
// requires editing both files in lock-step (the @sfx/validation Zod schemas
// + the apps/api controllers consume the @sfx/domain copy directly).
import type {
  DosDontsCategory,
  DosDontsType,
  GuidelineSearchSection,
} from '@sfx/domain';

export const DOS_DONTS_TYPES: readonly DosDontsType[] = ['do', 'dont'] as const;

export const DOS_DONTS_CATEGORIES: readonly DosDontsCategory[] = [
  'tone',
  'vocabulary',
  'visuals',
  'legal',
  'campaign-messaging',
] as const;

export const GUIDELINE_SEARCH_SECTIONS: readonly GuidelineSearchSection[] = [
  'voice',
  'visual',
  'dos-and-donts',
  'metadata',
] as const;
