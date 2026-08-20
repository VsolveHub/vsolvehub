import type { Metadata } from "next";

import { PartnerShell } from "@/features/session/partner-shell";
import { LanguagePicker } from "@/features/session/view/language-picker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Language",
  robots: { index: false, follow: false },
};

/**
 * Wrapped in `PartnerShell`, matching `/work`'s and `/money`'s own precedent
 * (`app/work/page.tsx`, Task 6; `app/money/page.tsx`, Task 10) — `PartnerShell`
 * is the only place `BottomTabBar`/`TAP_FIRST_NAV`, the top bar, the
 * notification bell and sign-out ever render, and nothing mounts it globally.
 *
 * Unlike those two, this page passes `requirePartnerRole`. `/work` and
 * `/money` replace `/dashboard` and `/earnings`, whose old route files were
 * both ungated — `/work` needs that specifically to stay reachable by
 * someone who has not applied yet. `/me/language` is new, but it sits in the
 * `/me` tree that replaces `/profile`, whose old `layout.tsx` did wrap
 * `<PartnerShell requirePartnerRole>` (Django's `GET /partner/me/` is
 * `IsPartnerUser`). A partner picking their display language is by
 * definition already an active, approved partner — there is no
 * not-applied-yet branch this screen needs to stay open for.
 */
export default function LanguagePage() {
  return (
    <PartnerShell requirePartnerRole>
      <LanguagePicker />
    </PartnerShell>
  );
}
