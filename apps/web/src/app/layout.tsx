import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getThemeScript } from '@/features/presentation/theme';
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
