import type { Metadata } from "next";

import { EarningsPanel } from "@/features/earnings/view/earnings-panel";
import { MoneyPageHeading } from "@/features/earnings/view/money-page-heading";
import { PartnerShell } from "@/features/session/partner-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Money",
  robots: { index: false, follow: false },
};

/**
 * The Money tab (`/money`) — one of the three permanent destinations in
 * `TAP_FIRST_NAV`, alongside `/work` and `/me`.
 *
 * ## Wrapped in `PartnerShell`, matching `/work`'s own precedent
 *
 * The task brief's own route sketch was a bare `<EarningsPanel />`, but
 * `PartnerShell` is the only place `BottomTabBar`/`TAP_FIRST_NAV` is ever
 * rendered (`features/session/partner-shell.tsx`) — nothing mounts it
 * globally. Shipping this page without it would mean the Money tab has no
 * way back to Work or Me, and no top bar, no notification bell, no sign
 * out. `requirePartnerRole` is on, matching `/work/all`: the earnings
 * endpoints answer `403` without the partner role selected, and the shell
 * auto-switches role when the session holds the grant.
 *
 * ## `<main>` and the landmark, not `EarningsPanel`'s job
 *
 * `EarningsPanel` renders three different return branches (pending, error,
 * success) and none of them carry a `<main>` today — the old
 * `app/earnings/page.tsx` supplied that wrapper at the route level, not
 * inside the shared component, so this keeps the same division of
 * responsibility rather than adding a landmark to a component whose data
 * logic this task is explicitly not meant to touch. The heading is
 * `sr-only`: the design direction here is pictures and numbers, the same
 * call `features/work-stack/view/work-home.tsx` already made for `/work`.
 */
export default function MoneyPage() {
  return (
    <PartnerShell requirePartnerRole>
      <main className="mx-auto w-full max-w-2xl px-4 py-6 lg:max-w-5xl lg:px-8 lg:py-10">
        <MoneyPageHeading />
        <EarningsPanel />
      </main>
    </PartnerShell>
  );
}
