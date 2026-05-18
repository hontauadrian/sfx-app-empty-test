import type { ReactNode } from 'react';
import { BrandGuidelinesHistoryDetailPage } from '@/features/brand-shell';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly brandId: string; readonly versionId: string }>;
}): Promise<ReactNode> {
  const { brandId, versionId } = await params;
  return (
    <BrandGuidelinesHistoryDetailPage brandId={brandId} versionId={versionId} />
  );
}
