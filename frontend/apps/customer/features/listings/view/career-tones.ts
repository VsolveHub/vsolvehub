import {
  Activity,
  Calculator,
  Code,
  HardHat,
  LayoutGrid,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type CareerTone = "blue" | "green" | "rose" | "amber" | "indigo" | "purple";

export interface CategoryToneConfig {
  key: string;
  label: string;
  tone: CareerTone;
  icon: LucideIcon;
  badgeClass: string;
}

export const CATEGORY_TONE_CONFIGS: Record<string, CategoryToneConfig> = {
  it: {
    key: "it",
    label: "IT & Software",
    tone: "blue",
    icon: Code,
    badgeClass: "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]",
  },
  finance: {
    key: "finance",
    label: "Accounts & Finance",
    tone: "green",
    icon: Calculator,
    badgeClass: "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]",
  },
  healthcare: {
    key: "healthcare",
    label: "Healthcare",
    tone: "rose",
    icon: Activity,
    badgeClass: "bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]",
  },
  retail: {
    key: "retail",
    label: "Retail & Shop Staff",
    tone: "amber",
    icon: Store,
    badgeClass: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
  },
  logistics: {
    key: "logistics",
    label: "Logistics",
    tone: "indigo",
    icon: Truck,
    badgeClass: "bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]",
  },
  construction: {
    key: "construction",
    label: "Construction",
    tone: "purple",
    icon: HardHat,
    badgeClass: "bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]",
  },
};

export const ALL_CATEGORIES_CONFIG: CategoryToneConfig = {
  key: "all",
  label: "All jobs",
  tone: "amber",
  icon: LayoutGrid,
  badgeClass: "bg-[#FFF1E6] text-[#B54700] border-[#FFD1A8]",
};

export function getCompanyInitials(name?: string): string {
  if (!name || !name.trim()) return "VH";
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return "VH";
}

export function resolveCategoryTone(category?: string, title?: string): CategoryToneConfig {
  const text = `${category || ""} ${title || ""}`.toLowerCase();

  // 1. IT & Software (excluding civil/site engineers)
  if (/\b(it|software|computer|developer|engineer|full stack|frontend|backend|react|node|qa|programmer|coder|tech)\b/i.test(text)) {
    if (/\b(construction|site|civil|builder|mason)\b/i.test(text)) {
      return CATEGORY_TONE_CONFIGS.construction;
    }
    return CATEGORY_TONE_CONFIGS.it;
  }

  // 2. Construction & Site
  if (/\b(construction|site|civil|builder|mason|carpenter|painter|electrician|plumber|supervisor)\b/i.test(text)) {
    return CATEGORY_TONE_CONFIGS.construction;
  }

  // 3. Healthcare
  if (/\b(health|medic|nurse|doctor|pharmacist|pharma|clinic|hospital|lab technician)\b/i.test(text)) {
    return CATEGORY_TONE_CONFIGS.healthcare;
  }

  // 4. Accounts & Finance
  if (/\b(account|finance|tally|gst|tax|bookkeep|auditor)\b/i.test(text)) {
    return CATEGORY_TONE_CONFIGS.finance;
  }

  // 5. Logistics & Warehouse
  if (/\b(logistics|warehouse|manufacturing|delivery|driver|transport|packer|helper|loader|dispatch|rider)\b/i.test(text)) {
    return CATEGORY_TONE_CONFIGS.logistics;
  }

  // 6. Retail & Sales Staff
  if (/\b(retail|sales|shop|store|showroom|billing|cashier|counter|jewellery)\b/i.test(text)) {
    return CATEGORY_TONE_CONFIGS.retail;
  }

  return CATEGORY_TONE_CONFIGS.retail;
}
