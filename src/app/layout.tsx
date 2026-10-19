import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TopBar } from '@/components/TopBar';
import { Toaster } from '@/components/ui';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = { title: 'Live Gold Feed', description: 'Gold-rate based variant pricing for Shopify' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.SHOPIFY_API_KEY || '6e8c56834b57b367be71f9b812c109dc';
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <meta name="shopify-api-key" content={apiKey} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" async></script>
      </head>
      <body suppressHydrationWarning>
        <TopBar />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
