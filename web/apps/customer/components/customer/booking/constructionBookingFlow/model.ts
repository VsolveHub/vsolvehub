import { roleRatePaise, DEFAULT_ROLE_RATE_PAISE } from "@/lib/crew/constants";

export type Step =
  | "bookingType"
  | "workforce"
  | "projectDetails"
  | "budgetPreference"
  | "searching"
  | "quotes"
  | "summary"
  | "payment";

export type WorkerRole = {
  id: string;
  label: string; // plural label e.g. "Masons"
  singular: string; // "Mason"
  icon: string;
  rate: number; // ₹ per worker per day
};

export type WorkerRow = {
  rowId: string;
  roleId: string;
  label: string;
  icon: string;
  count: number;
  rate: number;
};

export type CrewQuoteVM = {
  crewId: string;
  name: string;
  rating: number;
  reviewCount: number;
  city: string;
  equipment: string[];
  memberCount: number;
  covers: boolean;
  dailyRatePaise: number;
  totalPaise: number;
};

export type QuoteOption = {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  dailyRate: number;
  breakdown: string;
  covers: boolean;
};

// Preset construction roles. The displayed ₹/day derives from the single
// platform rate card (ROLE_DAY_RATE_PAISE, via roleRatePaise) — the same card
// the server recomputes the real quote from — so this estimate can never drift
// from the charge. Only labels/icons live here.
const rupeesPerDay = (roleId: string) => roleRatePaise(roleId) / 100;

export const WORKER_ROLES: WorkerRole[] = [
  { id: "mason", label: "Masons", singular: "Mason", icon: "🧱", rate: rupeesPerDay("mason") },
  { id: "helper", label: "Helpers / Labour", singular: "Helper", icon: "👷", rate: rupeesPerDay("helper") },
  { id: "bar-bender", label: "Bar Benders", singular: "Bar Bender", icon: "🦾", rate: rupeesPerDay("bar-bender") },
  { id: "carpenter", label: "Shuttering Carpenters", singular: "Shuttering Carpenter", icon: "🪵", rate: rupeesPerDay("carpenter") },
];

// Custom (write-in) role falls back to the card's default rate, not a separate literal.
export const CUSTOM_ROLE_RATE = DEFAULT_ROLE_RATE_PAISE / 100;

export function makeDefaultTeam(): WorkerRow[] {
  const defaults: Record<string, number> = { mason: 2, helper: 4, "bar-bender": 2, carpenter: 1 };
  return WORKER_ROLES.map((r) => ({
    rowId: r.id,
    roleId: r.id,
    label: r.label,
    icon: r.icon,
    count: defaults[r.id] ?? 1,
    rate: r.rate,
  }));
}

export function tomorrowISO() {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function crewSummary(workers: WorkerRow[]) {
  return workers.map((w) => `${w.icon} ${w.label}: ${w.count}`).join("  ·  ");
}

export function computeActiveWorkers(
  bookingType: "individual" | "team",
  individualRoleId: string,
  teamWorkers: WorkerRow[],
): WorkerRow[] {
  if (bookingType === "individual") {
    const role = WORKER_ROLES.find((r) => r.id === individualRoleId) ?? WORKER_ROLES[0];
    return [{ rowId: role.id, roleId: role.id, label: role.singular, icon: role.icon, count: 1, rate: role.rate }];
  }
  return teamWorkers.filter((w) => w.count > 0);
}

export function computeQuoteOptions(
  bookingType: "individual" | "team",
  individualRoleId: string,
  activeWorkers: WorkerRow[],
  crewQuotes: CrewQuoteVM[],
): QuoteOption[] {
  if (bookingType === "individual") {
    const role = WORKER_ROLES.find((r) => r.id === individualRoleId) ?? WORKER_ROLES[0];
    return [
      { id: "cand-1", name: `${role.singular} · Ramesh K.`, rating: 4.8, reviews: 64, dailyRate: role.rate, breakdown: "8+ yrs experience", covers: true },
      { id: "cand-2", name: `${role.singular} · Suresh M.`, rating: 4.6, reviews: 41, dailyRate: Math.max(role.rate - 100, 500), breakdown: "5 yrs experience", covers: true },
      { id: "cand-3", name: `${role.singular} · Anil R.`, rating: 4.9, reviews: 88, dailyRate: role.rate + 150, breakdown: "12 yrs · supervisor", covers: true },
    ];
  }
  return crewQuotes.map((c) => ({
    id: c.crewId,
    name: c.name,
    rating: c.rating,
    reviews: c.reviewCount,
    dailyRate: Math.round(c.dailyRatePaise / 100),
    breakdown: c.equipment.length ? c.equipment.join("  ·  ") : `${c.memberCount} members · ${crewSummary(activeWorkers)}`,
    covers: c.covers,
  }));
}

const STEP_BADGES: Record<Step, number> = {
  bookingType: 2,
  workforce: 3,
  projectDetails: 4,
  budgetPreference: 5,
  searching: 6,
  quotes: 7,
  summary: 8,
  payment: 8,
};

const STATIC_TITLES: Partial<Record<Step, string>> = {
  bookingType: "Choose Booking Type",
  projectDetails: "Project Details",
  budgetPreference: "Budget & Preference",
  summary: "Booking Summary",
  payment: "Payment",
};

export function getStepInfo(step: Step, bookingType: "individual" | "team"): { badge: number; title: string } {
  const badge = STEP_BADGES[step];
  if (step === "workforce") return { badge, title: bookingType === "individual" ? "Choose Worker" : "Workforce Requirement" };
  if (step === "searching") return { badge, title: bookingType === "individual" ? "Finding Worker" : "Finding Teams" };
  if (step === "quotes") return { badge, title: bookingType === "individual" ? "Choose Worker" : "Choose Team" };
  return { badge, title: STATIC_TITLES[step]! };
}

const BACK_STEP: Partial<Record<Step, Step>> = {
  workforce: "bookingType",
  projectDetails: "workforce",
  budgetPreference: "projectDetails",
  searching: "budgetPreference",
  quotes: "budgetPreference",
  payment: "summary",
};

export function getBackStep(step: Step, proceedChoice: "auto" | "quotes"): Step | null {
  if (step === "bookingType") return null;
  if (step === "summary") return proceedChoice === "quotes" ? "quotes" : "budgetPreference";
  return BACK_STEP[step] ?? null;
}
