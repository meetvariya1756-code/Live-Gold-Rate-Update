import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy & GDPR Compliance — LiveGold Feed',
  description: 'Privacy Policy and Data Protection Compliance for LiveGold Feed Shopify Application.',
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: '840px', margin: '0 auto', background: '#111827', borderRadius: '16px', border: '1px solid #1f2937', padding: '40px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffd700, #b8860b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#000', fontSize: '20px' }}>
            ✦
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Privacy Policy & GDPR Compliance</h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>LiveGold Feed for Shopify · Last Updated: October 2026</p>
          </div>
        </div>

        <section style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>1. Introduction & Overview</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            LiveGold Feed (&quot;we&quot;, &quot;our&quot;, or &quot;the App&quot;) is developed by Venner Infotech &amp; Marketing Solution to provide Shopify merchants with automated jewelry and precious metal pricing. We take privacy, data protection, and transparency extremely seriously. This policy explains our data handling practices and adherence to global privacy laws, including the European General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).
          </p>
        </section>

        <section style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>2. Zero End-Customer Personal Data Policy (PII)</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            <strong>LiveGold Feed does NOT collect, process, or store personally identifiable information (PII) of your end-customers or store visitors.</strong>
          </p>
          <ul style={{ fontSize: '14px', lineHeight: '1.6', color: '#94a3b8', paddingLeft: '20px' }}>
            <li>We do not collect names, email addresses, phone numbers, or physical addresses of customers.</li>
            <li>We do not inspect or store orders, cart contents, customer credit cards, or financial details.</li>
            <li>We only interact with catalog data (products, variants, metafields) to calculate and push jewelry price updates.</li>
          </ul>
        </section>

        <section style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>3. Information We Collect from Merchants</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            To provide live pricing automation for your store, we only access and store:
          </p>
          <ul style={{ fontSize: '14px', lineHeight: '1.6', color: '#94a3b8', paddingLeft: '20px' }}>
            <li><strong>Store Identification:</strong> Shopify domain (e.g. <code>store.myshopify.com</code>) and store name.</li>
            <li><strong>API Access Credentials:</strong> Shopify OAuth access tokens, securely encrypted at rest using AES-256-GCM.</li>
            <li><strong>Catalog &amp; Pricing Formula Data:</strong> Product IDs, variant IDs, SKU codes, product titles, weight, purity, making charges, gemstone charges, and metal rates configured by the merchant.</li>
          </ul>
        </section>

        <section style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>4. GDPR &amp; Mandatory Shopify Compliance Webhooks</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            In full compliance with Shopify Developer requirements, our application implements all mandatory GDPR webhooks with cryptographically verified HMAC signatures:
          </p>
          <div style={{ background: '#0b0f19', borderRadius: '8px', padding: '16px', border: '1px solid #1e293b', marginBottom: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px' }}><strong>• Customers Data Request (<code>/api/webhooks/customers-data-request</code>):</strong> When a customer requests their data from Shopify, our endpoint confirms that LiveGold Feed does not hold any customer PII.</p>
            <p style={{ margin: '0 0 8px', fontSize: '13px' }}><strong>• Customers Redact (<code>/api/webhooks/customers-redact</code>):</strong> When a merchant or customer requests data erasure, our endpoint automatically acknowledges erasure compliance.</p>
            <p style={{ margin: 0, fontSize: '13px' }}><strong>• Shop Redact (<code>/api/webhooks/shop-redact</code>):</strong> 48 hours after an app uninstall, our endpoint permanently wipes all encrypted API access tokens and merchant credentials from our database.</p>
          </div>
        </section>

        <section style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>5. Data Security</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            All communications between your Shopify store, our application, and our database are encrypted in transit via Transport Layer Security (TLS/HTTPS). All sensitive store tokens are stored encrypted using industry-standard AES-256-GCM encryption algorithms.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '18px', color: '#ffd700', marginTop: 0 }}>6. Contact &amp; Data Rights Requests</h2>
          <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1' }}>
            If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:
          </p>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>
            <strong>Developer / Author:</strong> Meet Variya<br />
            <strong>Organization:</strong> Venner Infotech &amp; Marketing Solution<br />
            <strong>Support Email:</strong> <a href="mailto:meetvariya1756@gmail.com" style={{ color: '#ffd700' }}>meetvariya1756@gmail.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
