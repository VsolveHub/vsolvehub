import { PartnerShell } from "@/features/session/partner-shell";

/** Every job screen is `IsPartnerUser`, so the Partner role must be selected. */
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
