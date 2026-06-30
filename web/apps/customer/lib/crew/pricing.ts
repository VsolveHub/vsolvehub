import { roleRatePaise } from "./constants";

export type CrewRoleRequest = { roleId: string; count: number };

/** Per-day crew price (paise) from the platform rate card. */
export function crewDailyRatePaise(roles: CrewRoleRequest[]): number {
  return roles.reduce((sum, r) => sum + Math.max(0, r.count) * roleRatePaise(r.roleId), 0);
}

/** Full flat, lead-settled quote (paise) for the whole project. */
export function crewQuotePaise(roles: CrewRoleRequest[], durationDays: number): number {
  const days = Math.max(1, Math.floor(durationDays));
  return crewDailyRatePaise(roles) * days;
}

/** Total head-count requested across all roles. */
export function crewHeadcount(roles: CrewRoleRequest[]): number {
  return roles.reduce((sum, r) => sum + Math.max(0, r.count), 0);
}
