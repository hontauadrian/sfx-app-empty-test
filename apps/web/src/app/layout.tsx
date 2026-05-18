import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getThemeScript } from '@/features/presentation/theme';
import { Sidebar } from '@/features/admin-shell';
import { Toaster } from '@/features/presentation/toast';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SFX App',
  description: 'SFX Webapp Boilerplate',
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1">{children}</div>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
