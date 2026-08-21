import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { AllWork } from "@/features/work-stack/view/all-work";

/**
 * The unfiltered stack (`/work/all`) — everything `/work` deliberately keeps
 * off the home.
 *
 * `requirePartnerRole`, unlike `/work` itself. The home's first branch is "you
 * have not applied yet" and Django grants the `partner` role when an
 * application is *created*, so that route cannot demand the role. This one has
 * no such branch: there is no list to show a person who has never worked, and
 * the work stack's six endpoints all answer `403` without the role anyway.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All your work",
  robots: { index: false, follow: false },
};

export default function AllWorkPage() {
  return (
    <PartnerShell requirePartnerRole>
      <AllWork />
    </PartnerShell>
  );
}
