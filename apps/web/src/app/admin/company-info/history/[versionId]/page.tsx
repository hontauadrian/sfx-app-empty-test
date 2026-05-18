import type { ReactNode } from 'react';
import { CompanyInfoHistoryDetailPage } from '@/features/company-info';

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly versionId: string }>;
}): Promise<ReactNode> {
  const { versionId } = await params;
  return <CompanyInfoHistoryDetailPage versionId={versionId} />;
}
