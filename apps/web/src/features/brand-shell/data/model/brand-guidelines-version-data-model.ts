import type { BrandVoiceDataModel } from './brand-voice-data-model';
import type { VisualIdentityDataModel } from './visual-identity-data-model';
import type { DosDontsEntryDataModel } from './dos-donts-entry-data-model';
import type { BrandMetadataDataModel } from './brand-metadata-data-model';

export interface BrandGuidelinesSnapshotDataModel {
  readonly voice: BrandVoiceDataModel | null;
  readonly visual: VisualIdentityDataModel | null;
  readonly dosAndDonts: readonly DosDontsEntryDataModel[];
  readonly metadata: BrandMetadataDataModel | null;
}

export interface BrandGuidelinesVersionDataModel {
  readonly id: string;
  readonly brandId: string;
  readonly snapshot: BrandGuidelinesSnapshotDataModel;
  readonly editorUserId: string;
  readonly editorDisplayName: string;
  readonly changeNote: string | null;
  readonly createdAt: string;
}

export interface BrandGuidelinesVersionsPageDataModel {
  readonly items: readonly BrandGuidelinesVersionDataModel[];
  readonly nextCursor: string | null;
}
