import type { ReactNode } from 'react';
import { BrandGuidelinesDetailPage } from '@/features/brand-shell';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export default async function Page({
  params,
}: {
  readonly params: Promise<{ readonly brandId: string }>;
}): Promise<ReactNode> {
  const { brandId } = await params;
  return <BrandGuidelinesDetailPage brandId={brandId} />;
}
