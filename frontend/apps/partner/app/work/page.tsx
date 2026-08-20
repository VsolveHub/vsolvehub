import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { WorkHome } from "@/features/work-stack/view/work-home";

/**
 * Where signing in lands, and the one place every offer, enquiry, job and
 * agreement appears. Never cached and never indexed: every branch depends on
 * the signed-in Partner's own application.
 *
 * ## Session-only, and not role-gated — the same rule `/dashboard` carried
 *
 * `PartnerShell` is mounted here without `requirePartnerRole`, exactly as the
 * screen this replaces did. The first branch of `WorkHome` is "you have not
 * applied yet", and Django grants the `partner` role when an application is
 * *created* — so requiring the role here would refuse precisely the person that
 * branch is written for. The part that does need the selected role, the work
 * stack itself, asks for it inside `WorkHome`.
 *
 * ## Why the shell is here rather than in an `app/work/layout.tsx`
 *
 * A layout would apply to `/work/offers/*`, `/work/enquiries/*` and
 * `/work/jobs/*` too, and those are `IsPartnerUser` screens that *should* be
 * role-gated — the two gates are genuinely different, so a shared layout would
 * have to pick the wrong one for somebody. Each route under `/work` therefore
 * mounts the shell it needs, which is also what keeps Tasks 7–9 free to add
 * their own `layout.tsx` without nesting a second shell inside this one.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Work",
  robots: { index: false, follow: false },
};

export default function WorkPage() {
  return (
    <PartnerShell>
      <WorkHome />
    </PartnerShell>
  );
}
