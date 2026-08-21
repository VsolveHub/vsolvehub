import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { CrewRosterScreen } from "@/features/crew/view/crew-screens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crew",
  robots: { index: false, follow: false },
};

/**
 * The Crew tab (`/me/crew`), reached from the `MeTile` on `/me`.
 *
 * ## `CrewRosterScreen`, not `CrewScreen`
 *
 * Task 12's own brief drafted an import of `CrewScreen` from `./crew-screen`,
 * flagged as a guess pending confirmation of the real component name. The
 * existing crew view is `CrewRosterScreen`, exported from
 * `features/crew/view/crew-screens.tsx` — already wired to `usePartnerCrew`,
 * `useAddCrewMember` and `useArchiveCrewMember`, and already wrapped in
 * `WorkspaceRoute` for the `crew.manage` M2 authorization gate. Importing the
 * real name rather than renaming the existing file, per the brief's own
 * instruction for this case.
 *
 * ## Wrapped in `PartnerShell requirePartnerRole`, matching `/me` and
 * `/me/language`'s precedent
 *
 * `PartnerShell` is the only place `BottomTabBar`/`TAP_FIRST_NAV`, the top
 * bar, the notification bell and sign-out ever render
 * (`features/session/partner-shell.tsx`) — nothing mounts it globally, so a
 * bare `<CrewRosterScreen />` here would have no way back to Work, Money or
 * Me, and no top chrome at all.
 *
 * `requirePartnerRole` is on, matching `app/me/page.tsx` and
 * `app/me/language/page.tsx` — both in the same `/me` tree, both gated for
 * the same reason: managing your own crew roster is a Partner-only action
 * reachable only from the already-gated `/me` screen (`MeTile href="/me/crew"`
 * in `features/session/view/me-home.tsx`), with no not-applied-yet,
 * under-review or suspended branch this screen needs to stay open for.
 */
export default function CrewPage() {
  return (
    <PartnerShell requirePartnerRole>
      <CrewRosterScreen />
    </PartnerShell>
  );
}
