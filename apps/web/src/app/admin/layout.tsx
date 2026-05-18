import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AdminRouteGate, AdminTabBar } from '@/features/admin-shell';

interface AdminLayoutProps {
  readonly children: ReactNode;
}

/**
 * @routeGuard authenticated
 * @unauthRedirect /login
 */
export default function AdminLayout({ children }: AdminLayoutProps): ReactNode {
  return (
    <AuthGate>
      <AdminRouteGate>
        <div className="flex min-h-screen flex-col bg-background">
          <AdminTabBar />
          <div className="flex-1">{children}</div>
        </div>
      </AdminRouteGate>
    </AuthGate>
  );
}
