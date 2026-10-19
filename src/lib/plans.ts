import { one, q } from '@/lib/db';

export type PlanId = 'trial' | 'starter' | 'pro' | 'enterprise';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  badge: string;
  priceMonthly: number;
  trialDays: number;
  productLimit: number; // Max configured products allowed
  allowedMetals: string[]; // Metals allowed in calculation
  allowCsvBulk: boolean; // CSV bulk export / import enabled
  allowAutoSync: boolean; // Automatic background live rate sync
  prioritySupport: boolean;
  tagline: string;
}

export const APP_PLANS: Record<PlanId, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: 'Free Trial',
    badge: '7-Day Trial',
    priceMonthly: 0,
    trialDays: 7,
    productLimit: 50,
    allowedMetals: ['gold_24k'],
    allowCsvBulk: false,
    allowAutoSync: false,
    prioritySupport: false,
    tagline: 'Test live jewelry pricing with up to 50 products',
  },
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    badge: '$19 / mo',
    priceMonthly: 19,
    trialDays: 7,
    productLimit: 250,
    allowedMetals: ['gold_24k'],
    allowCsvBulk: false,
    allowAutoSync: false,
    prioritySupport: false,
    tagline: 'Ideal for small jewelers — Up to 250 products',
  },
  pro: {
    id: 'pro',
    name: 'Growth / Pro Plan',
    badge: '$49 / mo',
    priceMonthly: 49,
    trialDays: 0,
    productLimit: 2000,
    allowedMetals: ['gold_24k', 'silver_999', 'platinum_950'],
    allowCsvBulk: true,
    allowAutoSync: true,
    prioritySupport: false,
    tagline: 'Most Popular — Up to 2,000 products with Gold, Silver & Platinum',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    badge: '$99 / mo',
    priceMonthly: 99,
    trialDays: 0,
    productLimit: Infinity,
    allowedMetals: ['gold_24k', 'silver_999', 'platinum_950'],
    allowCsvBulk: true,
    allowAutoSync: true,
    prioritySupport: true,
    tagline: 'Unlimited products, instant sync & priority support',
  },
};

/**
 * Returns the Plan definition for a given plan ID (defaults to 'starter' if undefined)
 */
export function getPlan(planId?: string | null): PlanDefinition {
  if (planId && planId in APP_PLANS) {
    return APP_PLANS[planId as PlanId];
  }
  return APP_PLANS.starter;
}

/**
 * Validates whether the store can configure another product or if they hit their plan limit
 */
export async function checkStoreProductLimit(storeId: number, targetProductGid?: string): Promise<{
  allowed: boolean;
  currentConfigured: number;
  productLimit: number;
  plan: PlanDefinition;
  message?: string;
}> {
  const store = await one<{ plan: string | null }>(
    'SELECT plan FROM stores WHERE id = $1',
    [storeId],
  );

  const plan = getPlan(store?.plan);

  // If already configured, editing does not count as a new product
  if (targetProductGid) {
    const isAlreadyConfigured = await one<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM variant_configs c
       JOIN variants v ON v.store_id = c.store_id AND v.gid = c.variant_gid
       WHERE c.store_id = $1 AND v.product_gid = $2`,
      [storeId, targetProductGid],
    );
    if ((isAlreadyConfigured?.count || 0) > 0) {
      const totalConfigured = await countConfiguredProducts(storeId);
      return { allowed: true, currentConfigured: totalConfigured, productLimit: plan.productLimit, plan };
    }
  }

  // Count distinct products that have at least 1 configured variant
  const totalConfigured = await countConfiguredProducts(storeId);

  if (totalConfigured >= plan.productLimit) {
    const nextPlan = plan.id === 'starter' || plan.id === 'trial' ? APP_PLANS.pro : APP_PLANS.enterprise;
    return {
      allowed: false,
      currentConfigured: totalConfigured,
      productLimit: plan.productLimit,
      plan,
      message: `You have reached your ${plan.name} limit (${plan.productLimit} products). Please upgrade to ${nextPlan.name} (${nextPlan.productLimit === Infinity ? 'Unlimited' : nextPlan.productLimit} products) to price more jewelry items.`,
    };
  }

  return {
    allowed: true,
    currentConfigured: totalConfigured,
    productLimit: plan.productLimit,
    plan,
  };
}

/**
 * Helper to count total configured products for a store
 */
export async function countConfiguredProducts(storeId: number): Promise<number> {
  const row = await one<{ count: number }>(
    `SELECT COUNT(DISTINCT v.product_gid)::int AS count
     FROM variant_configs c
     JOIN variants v ON v.store_id = c.store_id AND v.gid = c.variant_gid
     WHERE c.store_id = $1`,
    [storeId],
  );
  return row?.count || 0;
}
