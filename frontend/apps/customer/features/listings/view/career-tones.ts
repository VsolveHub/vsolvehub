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
  const cat = (category || "").toLowerCase();
  const t = (title || "").toLowerCase();

  if (cat.includes("soft") || cat.includes("it") || cat.includes("tech") || t.includes("developer") || t.includes("engineer") || t.includes("react") || t.includes("node") || t.includes("qa") || t.includes("frontend") || t.includes("backend")) {
    return CATEGORY_TONE_CONFIGS.it;
  }
  if (cat.includes("fin") || cat.includes("account") || cat.includes("tax") || t.includes("account") || t.includes("tally") || t.includes("gst") || t.includes("cashier") || t.includes("bookkeep")) {
    return CATEGORY_TONE_CONFIGS.finance;
  }
  if (cat.includes("health") || cat.includes("medic") || cat.includes("nurse") || t.includes("nurse") || t.includes("doctor") || t.includes("pharmacist") || t.includes("lab") || t.includes("clinic")) {
    return CATEGORY_TONE_CONFIGS.healthcare;
  }
  if (cat.includes("retail") || cat.includes("shop") || cat.includes("sales") || t.includes("sales") || t.includes("store") || t.includes("showroom") || t.includes("jewellery") || t.includes("counter")) {
    return CATEGORY_TONE_CONFIGS.retail;
  }
  if (cat.includes("logi") || cat.includes("deliver") || cat.includes("driver") || t.includes("packer") || t.includes("warehouse") || t.includes("dispatch") || t.includes("rider") || t.includes("driver")) {
    return CATEGORY_TONE_CONFIGS.logistics;
  }
  if (cat.includes("civil") || cat.includes("construct") || cat.includes("build") || t.includes("supervisor") || t.includes("civil") || t.includes("site") || t.includes("architect")) {
    return CATEGORY_TONE_CONFIGS.construction;
  }

  // Fallback defaults to finance or IT based on title hash for pleasant distribution
  return CATEGORY_TONE_CONFIGS.finance;
}
