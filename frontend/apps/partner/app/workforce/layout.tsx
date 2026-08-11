import { PartnerShell } from "@/features/session/partner-shell";

/**
 * The A3 workforce workspace.
 *
 * Role-gated, unlike `/dashboard`: every screen inside belongs to an approved
 * lifecycle capability, and Django guards each of them with `IsPartnerUser`. The
 * capability itself is checked per page by `WorkspaceRoute`, which is a
 * different question from holding the role — a Partner can be signed in, hold
 * the role, and hold no workforce capability at all.
 */
export default function WorkforceLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
