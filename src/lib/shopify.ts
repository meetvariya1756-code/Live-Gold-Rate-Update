import crypto from 'node:crypto';

// Shopify Admin GraphQL client + the queries/mutations this app needs.

export class ShopifyError extends Error {
  constructor(message: string, public status?: number, public details?: unknown) {
    super(message);
  }
}

export interface ShopCreds {
  shop_domain: string;
  access_token: string;
}

const API_VERSION = () => process.env.SHOPIFY_API_VERSION || '2025-10';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!d.includes('.')) d = `${d}.myshopify.com`;
  return d;
}

/**
 * Returns the reliable public base URL, resolving proxies and preventing 0.0.0.0 redirects.
 */
export function getAppBaseUrl(req: Request): string {
  const fwdHost = req.headers.get('x-forwarded-host');
  const host = req.headers.get('host');
  const incomingHost = (fwdHost || host || '').toLowerCase();

  // If request arrived on live domain, prioritize it over any stale tunnel URL in .env
  if (incomingHost.includes('live-gold-feed.vennerwp.com')) {
    return 'https://live-gold-feed.vennerwp.com';
  }

  const envUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/$/, '');
  // Ignore stale trycloudflare tunnel in .env when incoming host is not trycloudflare
  if (envUrl && !envUrl.includes('0.0.0.0')) {
    if (!envUrl.includes('trycloudflare.com') || incomingHost.includes('trycloudflare.com')) {
      return envUrl;
    }
  }

  if (fwdHost && !fwdHost.includes('0.0.0.0')) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${fwdHost}`;
  }

  if (host && !host.includes('0.0.0.0')) {
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  return 'https://live-gold-feed.vennerwp.com';
}

/**
 * Exchanges authorization code from Shopify OAuth redirect for a permanent offline access token.
 */
export async function exchangeOAuthCodeForAccessToken(
  shop_domain: string,
  code: string,
): Promise<{ access_token: string; scope: string; expires_in?: number; refresh_token?: string }> {
  const domain = normalizeDomain(shop_domain);
  const clientId = process.env.SHOPIFY_API_KEY?.trim();
  const clientSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new ShopifyError('Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET in environment variables');
  }

  const base = process.env.SHOPIFY_BASE_URL_OVERRIDE || `https://${domain}`;
  const url = `${base}/admin/oauth/access_token`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code.trim(),
      expiring: 1,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new ShopifyError(`Shopify OAuth token exchange failed (${res.status}): ${txt}`, res.status);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new ShopifyError(`Invalid Shopify OAuth token response: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function refreshOAuthAccessToken(
  shop_domain: string,
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number; refresh_token: string }> {
  const domain = normalizeDomain(shop_domain);
  const clientId = process.env.SHOPIFY_API_KEY?.trim();
  const clientSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new ShopifyError('Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET in environment variables');
  }

  const base = process.env.SHOPIFY_BASE_URL_OVERRIDE || `https://${domain}`;
  const url = `${base}/admin/oauth/access_token`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken.trim(),
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new ShopifyError(`Shopify token refresh failed (${res.status}): ${txt}`, res.status);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new ShopifyError(`Invalid Shopify token refresh response: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Verifies Shopify HMAC query parameter against the app secret.
 */
export function verifyShopifyHmac(searchParams: URLSearchParams, secret: string): boolean {
  const hmac = searchParams.get('hmac');
  if (!hmac || !secret) return false;

  const map: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    if (key !== 'hmac' && key !== 'signature') {
      map[key] = val;
    }
  });

  const message = Object.keys(map)
    .sort()
    .map((k) => `${k}=${map[k]}`)
    .join('&');

  try {
    const generated = crypto.createHmac('sha256', secret).update(message).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmac));
  } catch {
    return false;
  }
}

/**
 * Verifies Shopify Webhook HMAC header (X-Shopify-Hmac-Sha256)
 */
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  try {
    const generated = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function fetchAccessTokenWithClientCredentials(
  shop_domain: string,
  client_id: string,
  client_secret: string,
): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const domain = normalizeDomain(shop_domain);
  const base = process.env.SHOPIFY_BASE_URL_OVERRIDE || `https://${domain}`;
  const url = `${base}/admin/oauth/access_token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: client_id.trim(),
    client_secret: client_secret.trim(),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new ShopifyError(`Shopify token generation failed (${res.status}): ${txt}`, res.status);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new ShopifyError(`Invalid Shopify token response: ${JSON.stringify(json)}`);
  }
  return json;
}

export async function shopifyGql<T = any>(creds: ShopCreds, query: string, variables?: Record<string, unknown>): Promise<T> {
  // SHOPIFY_BASE_URL_OVERRIDE is only for local testing against a mock server
  const base = process.env.SHOPIFY_BASE_URL_OVERRIDE || `https://${creds.shop_domain}`;
  const url = `${base}/admin/api/${API_VERSION()}/graphql.json`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': creds.access_token },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new ShopifyError('Shopify rejected the access token (check token and API scopes read_products, write_products).', res.status);
    }
    if (!res.ok) throw new ShopifyError(`Shopify HTTP ${res.status}: ${await res.text()}`, res.status);
    const json = await res.json();
    const throttled = json.errors?.some((e: any) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      const status = json.extensions?.cost?.throttleStatus;
      const need = json.extensions?.cost?.requestedQueryCost || 100;
      const wait = status ? Math.max(1000, ((need - status.currentlyAvailable) / status.restoreRate) * 1000) : 2000;
      await sleep(wait);
      continue;
    }
    if (json.errors?.length) throw new ShopifyError(json.errors.map((e: any) => e.message).join('; '), 200, json.errors);
    // Gentle client-side throttle when the bucket gets low
    const ts = json.extensions?.cost?.throttleStatus;
    if (ts && ts.currentlyAvailable < 200) await sleep(1000);
    return json.data as T;
  }
  throw new ShopifyError('Shopify API throttled too many times, try again later.');
}

export async function getShopInfo(creds: ShopCreds) {
  const d = await shopifyGql<{ shop: { name: string; currencyCode: string; myshopifyDomain: string } }>(
    creds,
    `{ shop { name currencyCode myshopifyDomain } }`,
  );
  return d.shop;
}

export const METAFIELD_NAMESPACE = 'gold_pricing';
export const METAFIELD_KEY = 'breakup';

/** Creates the variant metafield definition with storefront read access so the theme can show the breakup. */
export async function ensureBreakupMetafieldDefinition(creds: ShopCreds) {
  const existing = await shopifyGql(
    creds,
    `query($ns:String!,$key:String!){ metafieldDefinitions(first:1, ownerType: PRODUCTVARIANT, namespace:$ns, key:$key){ nodes { id } } }`,
    { ns: METAFIELD_NAMESPACE, key: METAFIELD_KEY },
  );
  if (existing.metafieldDefinitions.nodes.length) return true;
  const r = await shopifyGql(
    creds,
    `mutation($d: MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition:$d){ createdDefinition{ id } userErrors{ field message code } } }`,
    {
      d: {
        name: 'Gold price breakup',
        namespace: METAFIELD_NAMESPACE,
        key: METAFIELD_KEY,
        type: 'json',
        ownerType: 'PRODUCTVARIANT',
        access: { storefront: 'PUBLIC_READ' },
        description: 'Price breakup written by LiveGold Feed',
      },
    },
  );
  const errs = r.metafieldDefinitionCreate.userErrors;
  if (errs?.length && !errs.some((e: any) => e.code === 'TAKEN')) throw new ShopifyError(errs.map((e: any) => e.message).join('; '));
  return true;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  position: number;
  selectedOptions: { name: string; value: string }[];
}
export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  status: string;
  options: { name: string; values: string[] }[];
  featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  variants: { nodes: ShopifyVariant[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

const VARIANT_FIELDS = `id title sku price compareAtPrice position selectedOptions { name value }`;
const PRODUCT_FIELDS = `
  id title handle status
  options { name values }
  featuredMedia { preview { image { url } } }
  variants(first: 100) { nodes { ${VARIANT_FIELDS} } pageInfo { hasNextPage endCursor } }
`;

async function fetchRemainingVariants(creds: ShopCreds, p: ShopifyProduct) {
  let after = p.variants.pageInfo.endCursor;
  let hasNext = p.variants.pageInfo.hasNextPage;
  while (hasNext) {
    const d = await shopifyGql(
      creds,
      `query($id:ID!,$after:String){ product(id:$id){ variants(first:250, after:$after){ nodes { ${VARIANT_FIELDS} } pageInfo { hasNextPage endCursor } } } }`,
      { id: p.id, after },
    );
    p.variants.nodes.push(...d.product.variants.nodes);
    hasNext = d.product.variants.pageInfo.hasNextPage;
    after = d.product.variants.pageInfo.endCursor;
  }
  return p;
}

/** Iterates all products of the store, page by page. */
export async function* iterateProducts(creds: ShopCreds, search?: string): AsyncGenerator<ShopifyProduct[]> {
  let after: string | null = null;
  for (;;) {
    const d: any = await shopifyGql(
      creds,
      `query($after:String,$q:String){ products(first:50, after:$after, query:$q, sortKey: TITLE){ nodes { ${PRODUCT_FIELDS} } pageInfo { hasNextPage endCursor } } }`,
      { after, q: search || null },
    );
    const nodes: ShopifyProduct[] = d.products.nodes;
    for (const p of nodes) if (p.variants.pageInfo.hasNextPage) await fetchRemainingVariants(creds, p);
    yield nodes;
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
}

export async function fetchProduct(creds: ShopCreds, gid: string): Promise<ShopifyProduct | null> {
  const d = await shopifyGql(creds, `query($id:ID!){ product(id:$id){ ${PRODUCT_FIELDS} } }`, { id: gid });
  if (!d.product) return null;
  return fetchRemainingVariants(creds, d.product);
}

export interface VariantPriceUpdate {
  id: string;
  price: string;
  compareAtPrice: string | null;
  breakupJson: string;
}

/** Updates price, compare-at price and breakup metafield for variants of ONE product. */
export async function bulkUpdateVariantPrices(creds: ShopCreds, productGid: string, updates: VariantPriceUpdate[]) {
  const errors: { id?: string; message: string }[] = [];
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const d = await shopifyGql(
      creds,
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: true) {
          productVariants { id price }
          userErrors { field message }
        }
      }`,
      {
        productId: productGid,
        variants: chunk.map((u) => ({
          id: u.id,
          price: u.price,
          compareAtPrice: u.compareAtPrice,
          metafields: [{ namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY, type: 'json', value: u.breakupJson }],
        })),
      },
    );
    for (const e of d.productVariantsBulkUpdate.userErrors || []) {
      const idx = Array.isArray(e.field) ? Number(e.field[1]) : NaN;
      errors.push({ id: Number.isFinite(idx) ? chunk[idx]?.id : undefined, message: e.message });
    }
  }
  return errors;
}
