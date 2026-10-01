import './globals.css';
import type { Metadata } from 'next';
import { TopBar } from '@/components/TopBar';
import { Toaster } from '@/components/ui';

export const metadata: Metadata = { title: 'Gold Rate Pricer', description: 'Gold-rate based variant pricing for Shopify' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <TopBar />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
