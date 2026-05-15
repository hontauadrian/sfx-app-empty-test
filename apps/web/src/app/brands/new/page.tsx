import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { AppShell } from '@/features/app-shell';
import { NewBrandPage } from '@/features/brand-profile';

export default function Page(): ReactNode {
  return (
    <AuthGate>
      <AppShell>
        <NewBrandPage />
      </AppShell>
    </AuthGate>
  );
}
