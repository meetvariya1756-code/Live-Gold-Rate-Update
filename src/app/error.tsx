'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Live Gold Feed] Error caught by boundary:', error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
        padding: '32px 20px',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e1e3e5',
          borderRadius: 12,
          padding: '36px 32px',
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: '#303030' }}>
          Unable to Load Store Dashboard
        </h2>
        <p style={{ color: '#616161', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
          {error?.message || 'An unexpected error occurred while loading your jewelry catalog. Please try refreshing or click below.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              background: '#303030',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => { window.location.href = '/admin'; }}
            style={{
              background: '#f1f2f4',
              color: '#303030',
              border: '1px solid #c9cccf',
              padding: '9px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go to Admin
          </button>
        </div>
      </div>
    </div>
  );
}
