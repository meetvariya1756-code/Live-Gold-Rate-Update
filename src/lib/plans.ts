export type PlanId = 'free';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  badge: string;
  priceMonthly: number;
  trialDays: number;
  productLimit: number; // Max configured products allowed
  allowedMetals: string[];
  allowCsvBulk: boolean;
  allowAutoSync: boolean;
  prioritySupport: boolean;
  tagline: string;
}

export const APP_PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    badge: '100% Free',
    priceMonthly: 0,
    trialDays: 0,
    productLimit: Infinity, // Unlimited products for all users
    allowedMetals: ['gold_24k', 'silver_999', 'platinum_950'],
    allowCsvBulk: true,
    allowAutoSync: true,
    prioritySupport: true,
    tagline: 'Completely free for all Shopify merchants with unlimited products',
  },
};

export function getPlan(_planId?: string | null): PlanDefinition {
  return APP_PLANS.free;
}

export async function checkStoreProductLimit(
  _storeId?: number,
  _targetProductGid?: string,
): Promise<{
  allowed: boolean;
  productLimit: number;
  plan: PlanDefinition;
}> {
  return {
    allowed: true,
    productLimit: Infinity,
    plan: APP_PLANS.free,
  };
}

