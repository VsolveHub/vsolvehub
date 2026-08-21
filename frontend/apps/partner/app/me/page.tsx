import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { MeHome } from "@/features/session/view/me-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Me",
  robots: { index: false, follow: false },
};

/**
 * The Me tab (`/me`) — one of the three permanent destinations in
 * `TAP_FIRST_NAV`, alongside `/work` and `/money`.
 *
 * ## Wrapped in `PartnerShell requirePartnerRole`, matching `/me/language`'s precedent
 *
 * `PartnerShell` is the only place `BottomTabBar`/`TAP_FIRST_NAV`, the top
 * bar, the notification bell and sign-out ever render
 * (`features/session/partner-shell.tsx`) — nothing mounts it globally, so a
 * bare `<MeHome />` here would have no way back to Work or Money and no top
 * chrome at all.
 *
 * `requirePartnerRole` is on, unlike `/work` and `/money`. Both of those
 * replace routes whose old gating had to stay open for someone mid-
 * application (`/dashboard`'s not-applied-yet branch, `/earnings`'s own old
 * ungated history) — `/me` has no such branch. It is the direct replacement
 * for `/profile` itself, whose old `layout.tsx` DID wrap
 * `PartnerShell requirePartnerRole` (Django's `GET /partner/me/` is
 * `IsPartnerUser`), and it sits in the same `/me` tree as
 * `app/me/language/page.tsx`, which already made this exact call for the
 * same reason. A Partner looking at their own profile/settings hub is by
 * definition already approved — there is no not-applied-yet, under-review or
 * suspended state this screen needs to stay open for.
 */
export default function MePage() {
  return (
    <PartnerShell requirePartnerRole>
      <MeHome />
    </PartnerShell>
  );
}
