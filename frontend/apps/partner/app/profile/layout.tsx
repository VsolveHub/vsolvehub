import { PartnerShell } from "@/features/session/partner-shell";

/**
 * The profile reads `GET /partner/me/`, which is `IsPartnerUser`, so the same
 * selected-role requirement applies as the rest of the signed-in app.
 */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell requirePartnerRole>{children}</PartnerShell>;
}
