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
          borderRadius: 12,
          width: '100%',
          maxWidth: 560,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #e1e3e5',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: '#303030',
            color: '#ffffff',
            padding: '18px 22px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#8a5a00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#ffffff', letterSpacing: 'normal', textTransform: 'none' }}>
                Store Data & Access Permissions
              </h2>
              <div style={{ fontSize: 12, color: '#c9cccf', marginTop: 2 }}>
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
                background: '#f7f7f8',
                border: '1px solid #e1e3e5',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ color: '#005bd3', marginTop: 2, flexShrink: 0 }}>
                <Gem size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#303030' }}>
                  Products & Inventory Variants
                </div>
                <div style={{ fontSize: 12, color: '#616161', marginTop: 2 }}>
                  Used to read jewelry weights (grams), gold purity (14k/18k/22k/24k), making charges, and dynamically push updated retail and compare-at prices to your Shopify catalog.
                </div>
              </div>
            </div>

            {/* Permission 2 */}
            <div
              style={{
                background: '#f7f7f8',
                border: '1px solid #e1e3e5',
                borderRadius: 8,
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
                <div style={{ fontWeight: 600, fontSize: 13, color: '#303030' }}>
                  Store Profile & Currency Settings
                </div>
                <div style={{ fontSize: 12, color: '#616161', marginTop: 2 }}>
                  Used to read your shop domain, store name, and local currency (e.g. INR, USD, AED, EUR) to accurately format gold rates and apply regional tax/GST rules.
                </div>
              </div>
            </div>

            {/* Permission 3 */}
            <div
              style={{
                background: '#f7f7f8',
                border: '1px solid #e1e3e5',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ color: '#007f5f', marginTop: 2, flexShrink: 0 }}>
                <Sliders size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#303030' }}>
                  Pricing Formulas & Custom Settings
                </div>
                <div style={{ fontSize: 12, color: '#616161', marginTop: 2 }}>
                  Used to save your store's custom pricing formulas (wastage percentages, diamond markups, rounding rules, and auto-sync schedules).
                </div>
              </div>
            </div>
          </div>

          {/* Privacy & Safety Guarantee */}
          <div
            style={{
              background: '#e4f8f0',
              border: '1px solid #84e1bc',
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div style={{ color: '#004c3f', flexShrink: 0 }}>
              <Lock size={18} />
            </div>
            <div style={{ fontSize: 12, color: '#004c3f', lineHeight: 1.4 }}>
              <b>Our Privacy Guarantee:</b> We <u>never</u> access or store your customers' personal data, payment credentials, or checkout details. All data is encrypted and strictly used solely for pricing automation.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 22px',
            background: '#f7f7f8',
            borderTop: '1px solid #e1e3e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, color: '#616161' }}>
            You can modify settings anytime in the app dashboard.
          </div>

          <button
            type="button"
            onClick={handleAccept}
            style={{
              background: '#303030',
              color: '#ffffff',
              border: '1px solid #303030',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 1px 0 rgba(0, 0, 0, 0.08)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a1a')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#303030')}
          >
            <CheckCircle2 size={15} />
            <span>I Understand & Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
