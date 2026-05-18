import type { ReactNode } from 'react';
import { BrandGuidelinesEmptyPage } from '@/features/brand-shell';

/**
 * @routeGuard authenticated
 * @unauthRedirect /oauth2/sign_in
 */
export default function Page(): ReactNode {
  return <BrandGuidelinesEmptyPage />;
}
