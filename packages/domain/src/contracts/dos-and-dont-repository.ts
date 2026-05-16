import type {
  DosAndDontCategory,
  DosAndDontEntry,
  DosAndDontType,
} from '../entities/dos-and-dont-entry';

export const DOS_AND_DONT_REPOSITORY = Symbol('DOS_AND_DONT_REPOSITORY');

export interface DosAndDontListFilter {
  readonly category?: DosAndDontCategory;
}

export interface DosAndDontCreateInput {
  readonly brandId: string;
  readonly type: DosAndDontType;
  readonly category: DosAndDontCategory;
  readonly title: string;
  readonly body: string;
  readonly suggestedCorrection: string | null;
}

export interface DosAndDontUpdatePatch {
  readonly type: DosAndDontType;
  readonly category: DosAndDontCategory;
  readonly title: string;
  readonly body: string;
  readonly suggestedCorrection: string | null;
}

export interface IDosAndDontRepository {
  listByBrand(brandId: string, filter?: DosAndDontListFilter): Promise<DosAndDontEntry[]>;
  findById(brandId: string, entryId: string): Promise<DosAndDontEntry | null>;
  create(input: DosAndDontCreateInput): Promise<DosAndDontEntry>;
  update(
    brandId: string,
    entryId: string,
    patch: DosAndDontUpdatePatch,
  ): Promise<DosAndDontEntry | null>;
  delete(brandId: string, entryId: string): Promise<boolean>;
}
