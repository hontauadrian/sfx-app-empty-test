import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { NewDosAndDontPage } from '@/features/dos-and-donts';

interface NewDosAndDontRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function Page({
  params,
}: NewDosAndDontRouteProps): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AuthGate>
      <AppShell>
        <NewDosAndDontPage brandId={id} />
      </AppShell>
    </AuthGate>
  );
}
