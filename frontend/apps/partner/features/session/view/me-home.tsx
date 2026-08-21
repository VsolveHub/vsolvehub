"use client";

import { hasWorkspaceAction, useLogout } from "@vsolve/query";
import { cn } from "@vsolve/ui";
import Link from "next/link";

import { Pictogram } from "@/components/pictogram";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { usePartnerProfile } from "@/features/profile/queries";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { getApiClient } from "@/lib/api/browser";

/**
 * The Me tab — profile and settings, and the one other place the presence
 * control renders.
 *
 * Replaces `/profile`. Mostly static: unlike `WorkHome`, nothing here reads
 * `usePartnerApplication` directly — `PartnerPresence` already does,
 * internally, to find the accepted consent version its "Go online" call
 * needs (see that component's own doc comment) — and a Partner cannot reach
 * this screen at all without already being approved, since `app/me/page.tsx`
 * wraps `PartnerShell requirePartnerRole`. There is no not-applied-yet,
 * under-review or suspended branch to answer here the way `WorkHome`
 * answers one for `/work`.
 *
 * Ported from the design canvas: `Me.dc.html` (artboard "9 · ME"). Two
 * departures from that artboard, both the plan's Deviation 4 / its own
 * no-fabricated-content constraint, not oversights:
 * - The Days tile is dropped, not disabled. Presence now lives on this
 *   screen as the same `PartnerPresence` control `WorkHome` renders in its
 *   own header, so a second, separate "Days" entry point would just be a
 *   second way to reach the one switch.
 * - The canvas's Skills and Help tiles are dropped too. Neither has an
 *   existing route or feature in this codebase to link to, and the plan is
 *   explicit that a tile is not shipped pointing nowhere. Six tiles in the
 *   canvas, minus Days, minus these two, leaves three: Crew, Money (drawn
 *   with the canvas's "Papers" glyph), Language.
 *
 * Three further departures from the brief's own draft code, all mechanical
 * corrections rather than judgment calls:
 * - The draft passed `strokeWidth={1.7}` to the avatar `Pictogram`.
 *   `Pictogram`'s props are exactly `{ name, className }`
 *   (`components/pictogram.tsx`) — stroke width is fixed at 1.8 inside the
 *   component and is not a prop at all, so this would not typecheck. Task 13
 *   hit the identical issue on `LanguagePicker` and dropped the prop the
 *   same way; doing the same here rather than reintroducing a defect this
 *   plan already found and fixed once.
 * - Every tap target in the brief's draft (three tiles, the sign-out
 *   button) was icon-only with no accessible name — `Pictogram` renders its
 *   `<svg>` as `aria-hidden`, so nothing here would announce anything to a
 *   screen reader. Every other icon-only tap target already shipped in this
 *   plan carries one (`WorkCard`'s `aria-label={cardLabel(item)}` in
 *   `features/work-stack/view/work-home.tsx`, on every card variant). Added
 *   a `label` prop to `MeTile` and an `aria-label` on Sign out to match.
 * - Added an `sr-only` `<h1>`, matching both other tab destinations
 *   (`WorkStack`'s `<h1 className="sr-only">Your work</h1>` and
 *   `MoneyPage`'s `<h1 className="sr-only">Money</h1>`) — the same
 *   reasoning applies unchanged here: the screen is pictures and icons, and
 *   the landmark still needs a name.
 * - `min-h-[calc(100dvh-9rem)]` rather than the draft's `min-h-screen`:
 *   `PartnerShell` already owns a sticky top bar and a fixed bottom tab
 *   bar, so a full-viewport main inside it scrolls by exactly the height
 *   of that chrome even with nothing below the fold. Matches
 *   `WorkStack`'s identical fix and its own comment
 *   (`features/work-stack/view/work-home.tsx:171-174`) verbatim — 9rem is
 *   the same sticky-header-plus-fixed-tab-bar allowance, not a new number.
 */
export function MeHome() {
  const logout = useLogout(getApiClient());
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-canvas">
      <h1 className="sr-only">Me</h1>

      <IdentityBand />

      <div className="px-4 pt-4">
        <PartnerPresence />
      </div>

      <div className="flex flex-1 flex-col px-4 pt-4.5">
        <div className="grid grid-cols-3 gap-2.5">
          {canManageCrew ? <MeTile href="/me/crew" icon="crew" label="Crew" /> : null}
          <MeTile href="/money" icon="papers" label="Money" />
          <MeTile href="/me/language" icon="language" tone="warning" label="Language" />
        </div>

        <Link
          href="/me/profile"
          className="mt-4 flex min-h-15 items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Pictogram name="crew" size="md" className="shrink-0 text-action-secondary" />
          <span className="flex-1 text-base font-semibold text-text">Your profile</span>
          <Pictogram name="go" size="sm" className="shrink-0 text-text-muted" />
        </Link>

        {/*
          Sign out is separated by a rule and sits last on the screen.

          It used to be a full-width tile in the grid above carrying nothing but
          a red `back` arrow — the same glyph that means "go back" on four other
          screens (`visit-job-view.tsx`, `enquiry-detail-screen.tsx`,
          `offer-detail-screen.tsx`, and this app's own header). One glyph
          cannot mean both "return" and "end your session", so this takes
          `power`, which no navigation control uses.
        */}
        <div className="mt-5 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-card border border-danger-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Pictogram name="power" size="md" className="text-danger-text" />
            <span className="text-base font-bold text-danger-text">
              {logout.isPending ? "Signing out…" : "Sign out"}
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * Who this Partner is, on the depth gradient.
 *
 * `usePartnerProfile` rather than a new endpoint: it is `SESSION_STATE`-cached
 * under `queryKeys.partner.me()` and `ProfilePanel` already reads it, so `/me`
 * and `/me/profile` share one response and the hop between them costs nothing.
 *
 * The name is not decoration. Every other tab addresses the Partner in the
 * second person — "Your work", "Earned today" — while the one screen *about*
 * them showed an anonymous glyph on a coloured square.
 *
 * A pending or failed read renders the glyph alone rather than a skeleton: this
 * band is not what anybody opens `/me` for, and a shimmering rectangle above
 * the tiles would draw the eye to the one thing on the screen that does
 * nothing.
 */
function IdentityBand() {
  const profile = usePartnerProfile();
  const trade = profile.data?.skills[0] ?? null;

  return (
    <div className="flex flex-col items-center gap-3 rounded-b-3xl bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-4 pt-6.5 pb-6">
      <span className="grid h-22 w-22 place-items-center rounded-[28px] bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] shadow-raised">
        <Pictogram name="crew" className="h-12 w-12 text-surface" />
      </span>

      {profile.data === undefined ? null : (
        <span className="flex max-w-full flex-col items-center gap-0.5">
          <span className="truncate text-xl font-bold text-surface">
            {profile.data.display_name}
          </span>
          <span className="truncate text-[0.8125rem] font-medium text-navy-200">
            {trade === null
              ? profile.data.phone_number
              : `${trade} · ${profile.data.phone_number}`}
          </span>
        </span>
      )}
    </div>
  );
}

function MeTile({
  href,
  icon,
  label,
  tone = "neutral",
}: {
  href: string;
  icon: Parameters<typeof Pictogram>[0]["name"];
  label: string;
  tone?: "neutral" | "warning";
}) {
  /*
    The label renders. It used to live only in `aria-label`, which left three
    identical-looking squares carrying a person, a document and a globe, and no
    way to tell Crew from Money from Language without tapping one.

    No `aria-label` any more: the visible text is the accessible name, and
    keeping both would announce it twice.
  */
  return (
    <Link
      href={href}
      className={
        tone === "warning"
          ? "flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-[18px] border border-action-line bg-action-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          : "flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-[18px] border border-line bg-surface shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      }
    >
      <Pictogram
        name={icon}
        size="xl"
        className={tone === "warning" ? "text-warning-text" : "text-action-secondary"}
      />
      <span
        className={cn(
          "text-[0.8125rem] font-bold",
          tone === "warning" ? "text-warning-text" : "text-text",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
