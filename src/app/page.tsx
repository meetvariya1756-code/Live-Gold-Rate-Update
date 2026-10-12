'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

export default function RootPage() {
  const router = useRouter();
  const [loadingText, setLoadingText] = useState('Routing to your dashboard…');

  useEffect(() => {
    // Check if shop parameter exists in current URL
    const urlParams = new URLSearchParams(window.location.search);
    const shop = urlParams.get('shop');

    if (shop) {
      setLoadingText('Connecting to store…');
      window.location.href = `/api/auth/shopify-direct?${urlParams.toString()}`;
      return;
    }

    // Check user session
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (!data?.user) {
          router.replace('/login');
          return;
        }

        const role = data.user.role;
        if (role === 'admin') {
          router.replace('/admin');
          return;
        }

        // Client role: find client's assigned store
        try {
          const res = await fetch('/api/stores');
          if (res.ok) {
            const stores = await res.json();
            if (Array.isArray(stores) && stores.length > 0) {
              router.replace(`/stores/${stores[0].id}`);
              return;
            }
          }
        } catch {}

        router.replace('/login');
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        gap: 16,
        color: '#94a3b8',
      }}
    >
      <Spinner />
      <div style={{ fontSize: 14 }}>{loadingText}</div>
    </div>
  );
}
