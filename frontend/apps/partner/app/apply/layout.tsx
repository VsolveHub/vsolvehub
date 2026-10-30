import type { Metadata } from "next";
import { Suspense } from "react";

import { ApplyGuard } from "@/features/application/view/apply-guard";
import { ApplyShell } from "@/features/application/view/apply-shell";
import { SITE_NAME } from "@/lib/site";

/**
 * The Partner onboarding tree.
 *
 * Dynamic and never indexed: every page under here depends on the signed-in
 * applicant's own record, so a shared cache entry would be wrong for everyone
 * after the first visitor, and a half-filled application is not a search result.
 *
 * ## Its own chrome, not the signed-in app's
 *
 * This used to render inside `PartnerShell`, which draws the four-destination
 * tab bar — Home, Work, Money, Me — on every route it wraps. All four point at
 * screens an applicant cannot use, and three of them refuse at the API. So
 * somebody halfway through onboarding got a persistent navigation whose every
 * destination was a dead end, a Sign Out button, and nothing at all telling them
 * how far through they were.
 *
 * `ApplyGuard` keeps the session check — the same `useAuthGuard` call, the same
 * `/login?next=` redirect — and `ApplyShell` draws what a linear flow actually
 * needs: where you are, one step back, and a way out. See `ApplyGuard`'s own
 * note on why this is not a second copy of the session decision.
 *
 * No role is required, matching Django: `PATCH /api/v1/partner/application/` is
 * `IsAuthenticated` and nothing more, because the `partner` role is granted when
 * an application is *created* — requiring it here would refuse every person who
 * has not applied yet, precisely the people this tree exists for.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // An object, not a string: a plain string here switches off the root
  // template for every page below, so their tabs lose the brand.
  title: { default: "Your application", template: `%s | ${SITE_NAME}` },
  robots: { index: false, follow: false },
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <ApplyGuard>
        <ApplyShell>{children}</ApplyShell>
      </ApplyGuard>
    </Suspense>
  );
}
