"use client";

import { cn, formatMoney } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { usePartnerPerformance } from "@/features/earnings/queries";
import { NotificationBell } from "@/features/notifications/view/notification-bell";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { resolveWorkspaces } from "@/features/workspace/registry";

import { DutyPill } from "./duty-control";

/**
 * The persistent top bar for the four tab destinations.
 *
 * ## What it stopped carrying, and why
 *
 * The previous bar spent its width on a logo, the word "Partner", and a
 * full-text **Sign Out** button. On a 360px viewport that is roughly 60% of the
 * most valuable row in the app given to three controls nobody needs:
 *
 * - **The logo.** This is an app you are inside, not a website you arrived at.
 *   Uber, Rapido, Swiggy and Zomato all drop brand chrome from the signed-in
 *   driver surface for exactly this reason — the row is worth more as status.
 * - **Sign out.** A once-a-year, session-ending action does not belong one
 *   mis-tap from the notification bell. It already exists on `/me`, under a
 *   rule, where it is looked for. Removing it here removes a duplicate, not a
 *   capability.
 *
 * What replaced them is what a Partner actually checks: **am I on duty**, and
 * **what have I made today**. Both were previously findable only by scrolling
 * the home screen.
 *
 * ## The earnings chip is a link, not a readout
 *
 * It goes to `/money`. A number you can see but not act on invites a second tap
 * hunting for the tab; making the number itself the target is one fewer.
 */
export function AppBar() {
  /*
    The bell needs the Partner's granted M2 workspace keys to know where an
    ENGAGEMENT notice may safely link — see `targetHref` in
    `features/notifications/model/feed.ts`, which drops a route this build has
    no grant for rather than sending someone to a screen that 403s. The shell
    used to resolve this and hand it down; the bell lives here now, so the read
    does too. It is a cached query and this is the only caller.
  */
  const grants = usePartnerWorkspaceGrants();
  const workspaceKeys = resolveWorkspaces(grants.grants ?? []).map((workspace) => workspace.key);

  return (
    <header
      className="z-30 shrink-0 border-b border-line bg-surface"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-appbar items-center gap-2 px-3 sm:px-4">
        <DutyPill />
        <div className="ml-auto flex items-center gap-1.5">
          <TodayChip />
          <NotificationBell workspaceKeys={workspaceKeys} />
        </div>
      </div>
    </header>
  );
}

/**
 * Today's take, in the bar.
 *
 * Renders nothing until there is a figure. A skeleton here would put a
 * shimmering rectangle in the fixed chrome of every screen for the first second
 * of every session, drawing the eye to the least urgent thing in the bar — and
 * unlike a card, chrome that flickers is visible on *every* navigation.
 *
 * `today_net_paise` is read straight off the endpoint, which publishes today,
 * this month and lifetime as their own fields; nothing here reduces a daily
 * series to find it.
 */
function TodayChip() {
  const performance = usePartnerPerformance();
  const paise = performance.data?.today_net_paise;

  if (paise === undefined) return null;

  return (
    <Link
      href="/money"
      aria-label={`Earned today ${formatMoney(paise)}. Open your money.`}
      className="pv-tap pv-press inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface-sunken px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="text-micro uppercase text-text-muted">Today</span>
      <span className="pv-num text-caption font-extrabold text-text">{formatMoney(paise)}</span>
    </Link>
  );
}

/**
 * The bar for a pushed screen: back, title, and whatever the screen needs.
 *
 * ## Titles come from the screen, not from a prefix table
 *
 * The bar this replaces guessed its own title by string-matching the pathname
 * against four hard-coded prefixes and fell through to the word "Details" for
 * everything else — so `/me/crew`, `/me/language`, `/me/profile`, every
 * `/apply/*` route and every future route read "Account" or "Details". A title
 * is content; it belongs to the screen that knows what it is showing.
 *
 * Rendered by `Screen`-owning routes through the shell, which passes what the
 * route declared. Where a route declares nothing the bar shows the back control
 * alone rather than inventing a word — an unlabelled bar is honest, a wrong
 * label is not.
 */
export function PushBar({
  title,
  subtitle,
  action,
  /** Where back goes when there is no history to pop — a deep link, a fresh tab. */
  fallbackHref = "/home",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  fallbackHref?: string;
}) {
  const router = useRouter();

  return (
    <header
      className="z-30 shrink-0 border-b border-line bg-surface"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className="flex h-appbar items-center gap-1 px-1.5 sm:px-2.5">
        <button
          type="button"
          onClick={() => {
            /*
              `router.back()` on a screen opened directly — a notification deep
              link, a shared URL, a reload — pops out of the app entirely,
              which on a phone browser means the Partner loses the app to
              whatever they were on before. `history.length <= 1` is the one
              signal available for "there is nothing of ours to go back to".
            */
            if (typeof window !== "undefined" && window.history.length <= 1) {
              router.replace(fallbackHref);
              return;
            }
            router.back();
          }}
          aria-label="Go back"
          className="pv-tap pv-press grid h-11 w-11 shrink-0 place-items-center rounded-pill text-text hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <ArrowLeft size={22} aria-hidden />
        </button>

        <div className="min-w-0 flex-1 px-1">
          {title === undefined ? null : (
            <h1 className="truncate text-title text-text">{title}</h1>
          )}
          {subtitle === undefined ? null : (
            <p className="truncate text-caption text-text-secondary">{subtitle}</p>
          )}
        </div>

        <div className={cn("flex shrink-0 items-center gap-1", action === undefined && "w-11")}>
          {action}
        </div>
      </div>
    </header>
  );
}
