import { PartnerShell } from "@/features/session/partner-shell";

/**
 * The home is session-only, not role-gated.
 *
 * Its first branch is "you have not applied yet", and Django grants the
 * `partner` role when an application is *created* — so requiring the role here
 * would refuse exactly the person that branch is written for. The one part of
 * this page that does need the selected role, the offer inbox, asks for it
 * itself.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell>{children}</PartnerShell>;
}
