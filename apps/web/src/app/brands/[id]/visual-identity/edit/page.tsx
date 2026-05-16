import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { EditVisualIdentityPage } from '@/features/visual-identity';

interface VisualIdentityEditRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function Page({
  params,
}: VisualIdentityEditRouteProps): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AuthGate>
      <AppShell>
        <EditVisualIdentityPage brandId={id} />
      </AppShell>
    </AuthGate>
  );
}
