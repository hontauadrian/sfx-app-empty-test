import type { Prisma } from '@sfx/database';
import type { BrandGuidelinesSnapshot } from '@sfx/domain';
import { toBrandVoice } from '../../../brand/data/mapper/brand-voice.mapper';
import { toVisualIdentity } from '../../../brand/data/mapper/visual-identity.mapper';
import { toDosDontsEntry } from '../mapper/dos-and-donts.mapper';
import { toBrandMetadata } from '../mapper/brand-metadata.mapper';

export async function composeSnapshotInTx(
  tx: Prisma.TransactionClient,
  brandId: string,
): Promise<BrandGuidelinesSnapshot> {
  const [voiceRow, visualRow, dosRows, metadataRow] = await Promise.all([
    tx.brandVoice.findUnique({ where: { brandId } }),
    tx.visualIdentity.findUnique({ where: { brandId } }),
    tx.dosDontsEntry.findMany({
      where: { brandId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    tx.brandMetadata.findUnique({ where: { brandId } }),
  ]);
  return {
    voice: voiceRow ? toBrandVoice(voiceRow) : null,
    visual: visualRow ? toVisualIdentity(visualRow) : null,
    dosAndDonts: dosRows.map(toDosDontsEntry),
    metadata: metadataRow ? toBrandMetadata(metadataRow) : null,
  };
}
