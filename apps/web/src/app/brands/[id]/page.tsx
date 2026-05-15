import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { BrandOverviewPage } from '@/features/brand-profile';

interface BrandOverviewRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function Page({ params }: BrandOverviewRouteProps): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AuthGate>
      <AppShell>
        <BrandOverviewPage brandId={id} />
      </AppShell>
    </AuthGate>
  );
}
