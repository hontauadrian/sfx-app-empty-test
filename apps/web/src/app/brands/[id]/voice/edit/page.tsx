import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { VoiceEditPage } from '@/features/brand-voice';

interface VoiceEditRouteProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function Page({ params }: VoiceEditRouteProps): Promise<ReactNode> {
  const { id } = await params;
  return (
    <AuthGate>
      <AppShell>
        <VoiceEditPage brandId={id} />
      </AppShell>
    </AuthGate>
  );
}
