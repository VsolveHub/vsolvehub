import {
  HardHat,
  Briefcase,
  Truck,
  Building2,
  PartyPopper,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { RoleSlug } from "@vsolve/config";
import type { Tone } from "./graphics";

export const ROLE_VISUALS: Record<RoleSlug, { icon: LucideIcon; tone: Tone }> = {
  captain: { icon: HardHat, tone: "brand" },
  professional: { icon: Briefcase, tone: "sky" },
  "rental-vendor": { icon: Truck, tone: "violet" },
  "property-host": { icon: Building2, tone: "green" },
  "event-vendor": { icon: PartyPopper, tone: "amber" },
  employer: { icon: Users, tone: "rose" },
};

export function roleVisual(slug: RoleSlug) {
  return ROLE_VISUALS[slug] ?? { icon: Briefcase, tone: "brand" as Tone };
}
