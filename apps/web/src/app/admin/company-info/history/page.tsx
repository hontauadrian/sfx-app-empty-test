import type { ReactNode } from 'react';
import { CompanyInfoHistoryPage } from '@/features/company-info';

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function Page(): ReactNode {
  return <CompanyInfoHistoryPage />;
}
