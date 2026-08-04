import { PartnerShell } from "@/features/session/partner-shell";

/**
 * Presence is `IsPartnerUser` like offers, so the same selected-role requirement
 * applies: going online with `customer` selected would be refused by every
 * presence call.
 */
export default function AvailabilityLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
