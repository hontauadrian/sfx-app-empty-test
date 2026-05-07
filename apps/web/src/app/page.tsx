import type { ReactNode } from 'react';
import { AuthGate } from '@/features/auth';
import { HomePage } from '@/features/home';

export default function Page(): ReactNode {
  return (
    <AuthGate>
      <HomePage />
    </AuthGate>
  );
}
