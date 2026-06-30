/** Client-safe crew constants (no server-only imports). */

export const CREW_ROLES = [
  { value: "supervisor", label: "Supervisor" },
  { value: "electrician", label: "Electrician" },
  { value: "wireman", label: "Wireman" },
  { value: "plumber", label: "Plumber" },
  { value: "mason", label: "Mason" },
  { value: "carpenter", label: "Carpenter" },
  { value: "painter", label: "Painter" },
  { value: "bar-bender", label: "Bar bender" },
  { value: "welder", label: "Welder" },
  { value: "helper", label: "Helper" },
] as const;

export const SKILL_LEVELS = [
  { value: "lead", label: "Lead / Master" },
  { value: "skilled", label: "Skilled" },
  { value: "helper", label: "Helper / Trainee" },
] as const;

/** Default day rate (paise) shown until a lead sets their own. Mirrors the customer platform card. */
export const PLATFORM_ROLE_RATE_PAISE: Record<string, number> = {
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

export function defaultRoleRatePaise(role: string): number {
  return PLATFORM_ROLE_RATE_PAISE[role] ?? 100000;
}

const ROLE_VALUES = new Set(CREW_ROLES.map((r) => r.value));

export function isValidRole(value: string): boolean {
  return ROLE_VALUES.has(value as (typeof CREW_ROLES)[number]["value"]);
}

export function roleLabel(value: string): string {
  return CREW_ROLES.find((r) => r.value === value)?.label ?? value;
}
