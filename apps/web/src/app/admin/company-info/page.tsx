import type { ReactNode } from 'react';
import { CompanyInfoPage } from '@/features/company-info';

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function Page(): ReactNode {
  return <CompanyInfoPage />;
}
