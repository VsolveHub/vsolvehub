import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { WorkHome } from "@/features/work-stack/view/work-home";

/**
 * Where signing in lands: availability, today's money, and anything that needs
 * this Partner right now.
 *
 * ## Why this moved off `/work`
 *
 * `/work` was doing two jobs — the status screen a vendor checks twenty times a
 * day, and the ledger of every record they touch. On any account with history
 * the ledger won: the availability control and today's earnings were pushed off
 * the top of the screen by a tail of quotes sent and jobs settled. The two are
 * separate destinations now, and `/work/all` is the ledger.
 *
 * ## Session-only, and not role-gated
 *
 * `PartnerShell` without `requirePartnerRole`, carried over from `/work`
 * unchanged. `WorkHome`'s first branch is "you have not applied yet", and
 * Django grants the `partner` role when an application is *created* — so
 * requiring the role here would refuse precisely the person that branch is
 * written for. The part that does need the selected role, the work stack
 * itself, asks for it inside `WorkHome`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return (
    <PartnerShell>
      <WorkHome />
    </PartnerShell>
  );
}
