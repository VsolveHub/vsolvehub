import { PartnerShell } from "@/features/session/partner-shell";

/**
 * Offers require the Partner role to be the session's *selected* one, matching
 * Django's `IsPartnerUser`. Anyone holding the grant while acting as another
 * role is offered the switch by the shell rather than a page of refusals.
 */
export default function OffersLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
