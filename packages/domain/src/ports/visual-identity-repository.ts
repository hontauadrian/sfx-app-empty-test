import type {
  VisualIdentity,
  UpsertVisualIdentityInput,
} from '../entities/visual-identity';
import type { BrandGuidelineEditor } from './brand-voice-repository';

export interface VisualIdentityRepository {
  findByBrandId(brandId: string): Promise<VisualIdentity | null>;
  upsertForBrand(
    brandId: string,
    input: UpsertVisualIdentityInput,
    editor: BrandGuidelineEditor,
    changeNote: string | null,
  ): Promise<VisualIdentity>;
}
