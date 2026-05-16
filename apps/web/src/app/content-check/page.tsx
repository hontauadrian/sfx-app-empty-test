import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { ContentCheckPage } from '@/features/content-check';

export default function Page(): ReactNode {
  return (
    <AuthGate>
      <AppShell>
        <ContentCheckPage />
      </AppShell>
    </AuthGate>
  );
}
