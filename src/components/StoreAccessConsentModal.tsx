'use client';
import { useState, useEffect } from 'react';
import { ShieldCheck, Gem, Store, Sliders, Lock, CheckCircle2 } from 'lucide-react';

const CONSENT_STORAGE_KEY = 'gold_rate_pricer_access_consent_v1';

export function StoreAccessConsentModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has already acknowledged permissions
    const acknowledged = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!acknowledged) {
      // Small delay for smooth entry on first app load
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        zIndex: 999999,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e5e7eb',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #111827, #1f2937)',
            color: '#ffffff',
            padding: '20px 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(217, 119, 6, 0.4)',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#ffffff', letterSpacing: 'normal', textTransform: 'none' }}>
                Store Data & Access Permissions
              </h2>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                Gold Rate Pricer • Shopify Embedded Application
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px 24px',
            maxHeight: 'calc(80vh - 160px)',
            overflowY: 'auto',
            background: '#ffffff',
            color: '#1f2937',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 600, color: '#111827' }}>
              Welcome to Gold Rate Pricer
            </p>
            <p style={{ margin: 0, color: '#4b5563', fontSize: 13 }}>
              To automatically calculate, synchronize, and update live gold, silver, and gemstone prices across your storefront, this software accesses the following store data:
            </p>
          </div>

          {/* Access Permissions List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {/* Permission 1 */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ color: '#2563eb', marginTop: 2, flexShrink: 0 }}>
                <Gem size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                  Products & Inventory Variants
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Used to read jewelry weights (grams), gold purity (14k/18k/22k/24k), making charges, and dynamically push updated retail and compare-at prices to your Shopify catalog.
                </div>
              </div>
            </div>

            {/* Permission 2 */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ color: '#7c3aed', marginTop: 2, flexShrink: 0 }}>
                <Store size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                  Store Profile & Currency Settings
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Used to read your shop domain, store name, and local currency (e.g. INR, USD, AED, EUR) to accurately format gold rates and apply regional tax/GST rules.
                </div>
              </div>
            </div>

            {/* Permission 3 */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ color: '#059669', marginTop: 2, flexShrink: 0 }}>
                <Sliders size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                  Pricing Formulas & Custom Settings
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                  Used to save your store's custom pricing formulas (wastage percentages, diamond markups, rounding rules, and auto-sync schedules).
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Safety Guarantee */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div style={{ color: '#166534', flexShrink: 0 }}>
              <Lock size={18} />
            </div>
            <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.4 }}>
              <b>Our Privacy Guarantee:</b> We <u>never</u> access or store your customers' personal data, payment credentials, or checkout details. All data is encrypted and strictly used solely for pricing automation.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 24px',
            background: '#f9fafb',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            You can modify settings anytime in the app dashboard.
          </div>

          <button
            type="button"
            onClick={handleAccept}
            style={{
              background: '#111827',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#111827')}
          >
            <CheckCircle2 size={16} />
            <span>I Understand & Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
