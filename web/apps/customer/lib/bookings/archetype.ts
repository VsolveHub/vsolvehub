import type { ProviderType } from "@/lib/provider/constants";

export const ARCHETYPES = ["A", "B", "C", "D", "E", "F"] as const;
export type ServiceArchetype = (typeof ARCHETYPES)[number];

export function resolveServiceArchetype(archetype: string): ServiceArchetype {
  return ARCHETYPES.includes(archetype as ServiceArchetype) ? (archetype as ServiceArchetype) : "A";
}

/** Archetypes A/B use push-dispatch to marketplace providers. */
export function usesPushDispatch(archetype: string): boolean {
  return archetype === "A" || archetype === "B";
}

export function providerTypeForArchetype(archetype: string): ProviderType {
  switch (archetype) {
    case "A":
      return "CAPTAIN";
    case "B":
      return "PROFESSIONAL";
    case "D":
      return "RENTAL_VENDOR";
    case "E":
      return "PROPERTY_HOST";
    case "F":
      return "EVENT_VENDOR";
    default:
      return "PROFESSIONAL";
  }
}

export function isMarketplaceBooking(booking: {
  assignedProviderId?: string | null;
  vendorAssignmentMode?: string | null;
  archetype?: string;
  vendorId?: string | null;
}): boolean {
  if (booking.assignedProviderId) return true;
  const archetype = booking.archetype ?? "A";
  if (!usesPushDispatch(archetype)) return false;
  if (booking.vendorAssignmentMode === "auto" || !booking.vendorId) return true;
  return false;
}
