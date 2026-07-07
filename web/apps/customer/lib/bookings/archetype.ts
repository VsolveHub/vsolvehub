export const ARCHETYPES = ["A", "B", "C", "D", "E", "F"] as const;
export type ServiceArchetype = (typeof ARCHETYPES)[number];

/** The provider types the DB actually dispatches to (matches the Prisma enum). */
export type DispatchProviderType = "CAPTAIN" | "DRIVER" | "CLEANER";

export function resolveServiceArchetype(archetype: string): ServiceArchetype {
  return ARCHETYPES.includes(archetype as ServiceArchetype) ? (archetype as ServiceArchetype) : "A";
}

/** Archetype A uses single-provider push-dispatch to marketplace partners (Phase 1). */
export function usesPushDispatch(archetype: string): boolean {
  return archetype === "A";
}

/**
 * All four Phase-1 dispatch categories (Technician/Beauty/Home/Pet) are archetype A
 * and served by CAPTAIN partners; the specific trade/skill (not the provider type)
 * distinguishes who is eligible. Returns a value valid against the Prisma enum.
 */
export function providerTypeForArchetype(_archetype: string): DispatchProviderType {
  return "CAPTAIN";
}

export function isMarketplaceBooking(booking: {
  assignedPartnerId?: string | null;
  vendorAssignmentMode?: string | null;
  archetype?: string;
  vendorId?: string | null;
}): boolean {
  if (booking.assignedPartnerId) return true;
  const archetype = booking.archetype ?? "A";
  if (!usesPushDispatch(archetype)) return false;
  if (booking.vendorAssignmentMode === "auto" || !booking.vendorId) return true;
  return false;
}
