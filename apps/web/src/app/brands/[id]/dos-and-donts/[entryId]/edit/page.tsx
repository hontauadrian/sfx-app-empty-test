import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { EditDosAndDontPage } from '@/features/dos-and-donts';

interface EditDosAndDontRouteProps {
  readonly params: Promise<{ readonly id: string; readonly entryId: string }>;
}

export default async function Page({
  params,
}: EditDosAndDontRouteProps): Promise<ReactNode> {
  const { id, entryId } = await params;
  return (
    <AuthGate>
      <AppShell>
        <EditDosAndDontPage brandId={id} entryId={entryId} />
      </AppShell>
    </AuthGate>
  );
}
