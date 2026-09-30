import { request } from "@vsolve/api-client";

import { getApiClient } from "@/lib/api/browser";

export const PREMIUM_CAPABILITIES = [
  { code: "FEATURED_PLACEMENT", label: "Featured placement" },
  { code: "PRIORITY_MODERATION", label: "Priority moderation" },
] as const;

export type PremiumCapabilityCode = (typeof PREMIUM_CAPABILITIES)[number]["code"];

export type OpsVendorPlanService = {
  id: string;
  name: string;
  slug: string;
  subcategory_name: string;
};

export type OpsVendorPlan = {
  id: string;
  service: string | null;
  service_name: string | null;
  service_slug: string | null;
  code: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_active_listings: number;
  premium_capabilities: unknown;
  premium_price_paise: number;
  details: string;
  is_active: boolean;
};

export type OpsVendorPlanCatalog = {
  plans: OpsVendorPlan[];
  services: OpsVendorPlanService[];
};

export type VendorPlanWrite = {
  service: string | null;
  code?: string;
  name: string;
  price_paise: number;
  duration_days: number;
  max_active_listings: number;
  premium_capabilities: string[];
  premium_price_paise: number;
  details: string;
  is_active: boolean;
};

type LooseClient = {
  GET: (path: string) => ReturnType<ReturnType<typeof getApiClient>["GET"]>;
  POST: (
    path: string,
    init: { body: VendorPlanWrite },
  ) => ReturnType<ReturnType<typeof getApiClient>["POST"]>;
  PATCH: (
    path: string,
    init: { body: Partial<VendorPlanWrite> },
  ) => ReturnType<ReturnType<typeof getApiClient>["PATCH"]>;
};

function looseApi(): LooseClient {
  return getApiClient() as unknown as LooseClient;
}

export function rupeesToPaise(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function paiseToRupeeInput(paise: number): string {
  return (paise / 100).toString();
}

export function capabilityCodes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function fetchOpsVendorPlans(): Promise<OpsVendorPlanCatalog> {
  const data = await request(() => looseApi().GET("/api/v1/ops/vendor-subscription-plans"));
  const catalog = data as unknown as OpsVendorPlanCatalog | null;
  return {
    plans: Array.isArray(catalog?.plans) ? catalog.plans : [],
    services: Array.isArray(catalog?.services) ? catalog.services : [],
  };
}

export async function createOpsVendorPlan(body: VendorPlanWrite): Promise<OpsVendorPlan> {
  return request(() =>
    looseApi().POST("/api/v1/ops/vendor-subscription-plans", { body }),
  ) as Promise<OpsVendorPlan>;
}

export async function updateOpsVendorPlan(
  planId: string,
  body: Partial<VendorPlanWrite>,
): Promise<OpsVendorPlan> {
  return request(() =>
    looseApi().PATCH(`/api/v1/ops/vendor-subscription-plans/${planId}`, { body }),
  ) as Promise<OpsVendorPlan>;
}
