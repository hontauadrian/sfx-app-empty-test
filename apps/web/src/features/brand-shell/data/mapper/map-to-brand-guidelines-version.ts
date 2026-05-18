import type { BrandGuidelinesSnapshot, BrandGuidelinesVersion } from '@sfx/domain';
import type {
  BrandGuidelinesSnapshotDataModel,
  BrandGuidelinesVersionDataModel,
  BrandGuidelinesVersionsPageDataModel,
} from '../model/brand-guidelines-version-data-model';
import { mapToBrandVoiceOrNull } from './map-to-brand-voice';
import { mapToVisualIdentityOrNull } from './map-to-visual-identity';
import { mapToDosDontsEntry } from './map-to-dos-donts-entry';
import { mapToBrandMetadata } from './map-to-brand-metadata';

function mapToSnapshot(data: BrandGuidelinesSnapshotDataModel): BrandGuidelinesSnapshot {
  return {
    voice: mapToBrandVoiceOrNull(data.voice),
    visual: mapToVisualIdentityOrNull(data.visual),
    dosAndDonts: data.dosAndDonts.map(mapToDosDontsEntry),
    metadata: data.metadata ? mapToBrandMetadata(data.metadata) : null,
  };
}

export function mapToBrandGuidelinesVersion(
  data: BrandGuidelinesVersionDataModel,
): BrandGuidelinesVersion {
  return {
    id: data.id,
    brandId: data.brandId,
    snapshot: mapToSnapshot(data.snapshot),
    editorUserId: data.editorUserId,
    editorDisplayName: data.editorDisplayName,
    changeNote: data.changeNote,
    createdAt: new Date(data.createdAt),
  };
}

export function mapToBrandGuidelinesVersionsPage(
  data: BrandGuidelinesVersionsPageDataModel,
): {
  readonly items: readonly BrandGuidelinesVersion[];
  readonly nextCursor: string | null;
} {
  return {
    items: data.items.map(mapToBrandGuidelinesVersion),
    nextCursor: data.nextCursor,
  };
}
