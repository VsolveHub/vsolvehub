import { PartnerShell } from "@/features/session/partner-shell";

/**
 * The A5 project workspace.
 *
 * Role-gated for the same reason as `/workforce`: everything inside belongs to
 * an approved capability, and holding the Partner role is not the same as
 * holding that capability. `WorkspaceRoute` asks the second question per page.
 */
export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
