// Client-safe crew constants for the customer marketplace.

/**
 * Platform day-rate card per role (paise). The customer-facing crew quote is
 * computed from this card × requested head-count × days — deterministic and
 * server-recomputed, so the price never depends on client input. Members'
 * own day-rates stay the lead's private reference (see partner app).
 */
export const ROLE_DAY_RATE_PAISE: Record<string, number> = {
  supervisor: 180000,
  electrician: 150000,
  wireman: 130000,
  plumber: 140000,
  mason: 120000,
  carpenter: 130000,
  painter: 120000,
  "bar-bender": 110000,
  welder: 140000,
  helper: 80000,
};

/** Map a service name/category to the crew trade used for matching. */
export function tradeSlugForService(name: string, categorySlug?: string): string {
  if (categorySlug === "construction-services") return "construction";
  const n = name.toLowerCase();
  if (n.includes("electric")) return "electrician";
  if (n.includes("plumb")) return "plumber";
  if (n.includes("paint")) return "painter";
  if (n.includes("carpenter")) return "carpenter";
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export const DEFAULT_ROLE_RATE_PAISE = 100000;

export function roleRatePaise(roleId: string): number {
  return ROLE_DAY_RATE_PAISE[roleId] ?? DEFAULT_ROLE_RATE_PAISE;
}

export const CREW_ROLE_LABELS: Record<string, string> = {
  supervisor: "Supervisor",
  electrician: "Electrician",
  wireman: "Wireman",
  plumber: "Plumber",
  mason: "Mason",
  carpenter: "Carpenter",
  painter: "Painter",
  "bar-bender": "Bar bender",
  welder: "Welder",
  helper: "Helper",
};

export function crewRoleLabel(role: string): string {
  return CREW_ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1).replace(/-/g, " ");
}

/** Crew booking lifecycle (distinct from the per-visit service track). */
export const CREW_TIMELINE = ["CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING", "COMPLETED"] as const;
/** Auto-assign adds a "finding a crew" stage before assignment. */
export const CREW_AUTO_TIMELINE = ["SEARCHING_CREW", "CREW_ASSIGNED", "CREW_EN_ROUTE", "CREW_WORKING", "COMPLETED"] as const;

export const CREW_STATUS_LABELS: Record<string, string> = {
  SEARCHING_CREW: "Finding a crew",
  NO_CREW_FOUND: "No crew available",
  CREW_ASSIGNED: "Crew assigned",
  CREW_EN_ROUTE: "Crew on the way",
  CREW_WORKING: "Work in progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const CREW_STATUS_MESSAGES: Record<string, string> = {
  SEARCHING_CREW: "We've notified nearby crews. The first to accept your request will be assigned.",
  NO_CREW_FOUND: "No crew accepted in time. You can retry the request or pick a crew yourself.",
  CREW_ASSIGNED: "Your crew is confirmed. The lead will head to your site on the start date.",
  CREW_EN_ROUTE: "Your crew lead is on the way to the site.",
  CREW_WORKING: "Your crew is working on site. Track daily attendance below.",
  COMPLETED: "All work days are complete. You can pay now.",
  CANCELLED: "This booking was cancelled.",
};

export const CREW_DAY_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CREW_EN_ROUTE: "On the way",
  WORKING: "Working",
  DAY_DONE: "Day finished",
  APPROVED: "Approved",
};
