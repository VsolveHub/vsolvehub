import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { ProfilePanel } from "@/features/profile/view/profile-panel";

/**
 * I4 — `ProfilePanel` was fully built and mounted nowhere. This restores
 * reachability only; it still carries the pre-redesign lucide-icon/Card
 * visual language rather than the drawn Pictogram set the rest of the
 * tap-first surface uses. A full restyling pass is separate follow-up work.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <PartnerShell requirePartnerRole>
      <ProfilePanel />
    </PartnerShell>
  );
}
