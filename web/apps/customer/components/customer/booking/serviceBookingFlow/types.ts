import type { getServiceConfig } from "@/lib/catalog/service-config";
import type { estimatePrice } from "@/lib/catalog/pricing";

export type Step = "service" | "guidelines" | "details";

export type ServiceConfig = ReturnType<typeof getServiceConfig>;
export type PriceEstimate = ReturnType<typeof estimatePrice>;

export type FlowService = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
  duration: number;
  unit: string;
  category: { slug: string; name: string; icon: string };
  subCategory: { slug: string; name: string } | null;
};
