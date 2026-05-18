import type { Prisma } from '@sfx/database';
import type { BrandGuidelineEditor } from '@sfx/domain';
import { composeSnapshotInTx } from './snapshot-composer';
import { toVersionSnapshotJson } from '../mapper/brand-guidelines-version.mapper';

export async function writeBrandGuidelinesVersion(
  tx: Prisma.TransactionClient,
  brandId: string,
  editor: BrandGuidelineEditor,
  changeNote: string | null,
): Promise<string> {
  const snapshot = await composeSnapshotInTx(tx, brandId);
  const row = await tx.brandGuidelinesVersion.create({
    data: {
      brandId,
      snapshot: toVersionSnapshotJson(snapshot) as Prisma.InputJsonValue,
      editorUserId: editor.editorUserId,
      editorDisplayName: editor.editorDisplayName,
      changeNote: changeNote ?? null,
    },
  });
  return row.id;
}
