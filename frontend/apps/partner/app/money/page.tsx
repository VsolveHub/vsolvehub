import type { Metadata } from "next";

import { EarningsPanel } from "@/features/earnings/view/earnings-panel";
import { PartnerShell } from "@/features/session/partner-shell";
import { Block, Screen } from "@/features/shell/view/screen";

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
 * out. `requirePartnerRole` is left off, matching `app/work/page.tsx`
 * (Task 6) and the currently-live `app/earnings/page.tsx` this route
 * replaces (Task 5 redirects `/earnings` here) — both use the plain,
 * unrestricted shell rather than `requirePartnerRole`.
 *
 * ## The heading is visible now
 *
 * It was `sr-only`, on the rule that this app renders pictures and numbers
 * rather than words. That rule cost more than it saved here: `/money` is the
 * one tab whose content is four different figures with four different
 * meanings, and it opened with no statement of what screen you were on. The
 * other three tabs all name themselves.
 *
 * `EarningsPanel` renders three return branches (pending, error, success) and
 * none of them carry a landmark — the wrapper stays at the route level, which
 * is where it has always been.
 */
export default function MoneyPage() {
  return (
    <PartnerShell>
      <Screen>
        <Block gap="none" className="py-4">
          <h1 className="pb-3 text-headline text-text">Your money</h1>
          <EarningsPanel />
        </Block>
      </Screen>
    </PartnerShell>
  );
}
