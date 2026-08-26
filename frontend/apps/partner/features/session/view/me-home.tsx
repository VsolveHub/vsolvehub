"use client";

import { hasWorkspaceAction, useLogout } from "@vsolve/query";
import { cn } from "@vsolve/ui";
import { CalendarDays, ChevronRight, Globe, HardHat, LogOut, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { usePartnerPerformance } from "@/features/earnings/queries";
import { usePartnerProfile } from "@/features/profile/queries";
import { useDuty } from "@/features/presence/duty-context";
import { DutySheet } from "@/features/shell/view/duty-control";
import { Block, Screen } from "@/features/shell/view/screen";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { getApiClient } from "@/lib/api/browser";

/**
 * The Me tab — who this Partner is, and everything they control.
 *
 * ## What the redesign changed
 *
 * The screen it replaces was a grid of three coloured squares (Crew, Money,
 * Language) above a profile row and a sign-out button, plus a full copy of the
 * duty control. Three problems, all fixed here:
 *
 * 1. **A settings screen is a list, not a launcher.** Square tiles are for
 *    things you reach for by muscle memory a dozen times a day; a settings hub
 *    is scanned once, by reading. Three squares meant three short labels under
 *    three glyphs, with no room to say what any of them does — and the grid did
 *    not survive a fourth item without rewrapping. Rows scan faster, carry a
 *    supporting line, and grow.
 *
 * 2. **The duty control was a second copy.** It now lives in one provider with
 *    a permanent indicator in the app bar (`features/presence/duty-context.tsx`
 *    explains the two-heartbeat problem that ended). This screen links to the
 *    same sheet rather than mounting a second control.
 *
 * 3. **The identity band said nothing.** It showed a glyph on a coloured square
 *    with a name under it. It now also carries how many jobs this Partner has
 *    finished and how long they have been one — `lifetime_jobs` off
 *    `PartnerPerformance` and `member_since` off `PartnerProfile`, both already
 *    fetched for other screens, so neither costs a request. There is
 *    deliberately no rating: the contract publishes none on either payload, and
 *    the one number a Partner would most want here is not one this app is
 *    allowed to invent.
 *
 * ## Nothing is shipped pointing nowhere
 *
 * The rows below are exactly the destinations this codebase has routes for.
 * The design canvas drew Skills and Help tiles too; neither has a route or a
 * feature to link to, so neither is drawn. A tile that navigates to a 404 is
 * worse than a screen with three rows.
 */
export function MeHome() {
  const logout = useLogout(getApiClient());
  const grants = usePartnerWorkspaceGrants();
  const canManageCrew = hasWorkspaceAction(grants.grants ?? [], WORKFORCE_WORKSPACE, "crew.manage");

  return (
    <Screen>
      <h1 className="sr-only">Me</h1>

      <IdentityBand />

      <Block gap="none" className="flex-1 py-4">
        <DutyRow />

        <p className="px-1 pt-5 pb-2 text-micro uppercase text-text-muted">Your account</p>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <MeRow
            href="/me/profile"
            icon={<UserRound size={20} aria-hidden />}
            label="Your profile"
            detail="Name, trades, service areas and documents"
          />
          {canManageCrew ? (
            <MeRow
              href="/me/crew"
              icon={<HardHat size={20} aria-hidden />}
              label="Your crew"
              detail="The people you send to jobs"
            />
          ) : null}
          <MeRow
            href="/money"
            icon={<Wallet size={20} aria-hidden />}
            label="Money and payouts"
            detail="Balance, statement and where we pay you"
          />
          <MeRow
            href="/me/language"
            icon={<Globe size={20} aria-hidden />}
            label="Language"
            detail="Choose the language this app uses"
            last
          />
        </div>

        {/*
          Sign out is separated by a gap and sits last, on its own.

          It used to be a full-width tile carrying a red `back` arrow — the same
          glyph that means "go back" on four other screens and in this app's own
          header. One glyph cannot mean both "return" and "end your session".
        */}
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="pv-tap pv-press mt-5 flex h-13 w-full items-center justify-center gap-2.5 rounded-card border border-danger-line bg-surface disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <LogOut size={18} className="text-danger-text" aria-hidden />
          <span className="text-title text-danger-text">
            {logout.isPending ? "Signing out…" : "Sign out"}
          </span>
        </button>
      </Block>
    </Screen>
  );
}

/**
 * Who this Partner is, on the depth gradient.
 *
 * `usePartnerProfile` rather than a new endpoint: it is cached under
 * `queryKeys.partner.me()` and `ProfilePanel` already reads it, so `/me` and
 * `/me/profile` share one response and the hop between them costs nothing.
 *
 * A pending or failed read renders the glyph alone rather than a skeleton. This
 * band is not what anybody opens `/me` for, and a shimmering rectangle above
 * the rows would draw the eye to the one thing on the screen that does nothing.
 */
function IdentityBand() {
  const profile = usePartnerProfile();
  const trade = profile.data?.skills[0] ?? null;

  return (
    <div className="flex flex-col items-center gap-3 rounded-b-sheet bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] px-5 pt-6 pb-6">
      <span className="grid h-20 w-20 place-items-center rounded-sheet bg-[linear-gradient(150deg,var(--color-navy-300)_0%,var(--color-navy-500)_100%)] shadow-raised">
        <UserRound size={40} className="text-surface" aria-hidden />
      </span>

      {profile.data === undefined ? null : (
        <span className="flex max-w-full flex-col items-center gap-1">
          <span className="truncate text-headline text-surface">{profile.data.display_name}</span>
          <span className="pv-num truncate text-caption font-medium text-navy-200">
            {trade === null
              ? profile.data.phone_number
              : `${trade} · ${profile.data.phone_number}`}
          </span>
        </span>
      )}

      <Credentials memberSince={profile.data?.member_since ?? null} />
    </div>
  );
}

/**
 * Two facts about the account, and only ones the server publishes.
 *
 * Each chip renders on its own or not at all, rather than the pair waiting for
 * both reads: they come from two different endpoints and holding the row back
 * for the slower one would blank a fact that had already arrived.
 */
function Credentials({ memberSince }: { memberSince: string | null }) {
  const performance = usePartnerPerformance();
  const jobs = performance.data?.lifetime_jobs ?? null;

  const since = (() => {
    if (memberSince === null) return null;
    const at = new Date(memberSince);
    if (Number.isNaN(at.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(at);
  })();

  if (jobs === null && since === null) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {jobs === null ? null : (
        <Chip icon={<HardHat size={14} aria-hidden />}>
          {jobs} {jobs === 1 ? "job" : "jobs"} done
        </Chip>
      )}
      {since === null ? null : (
        <Chip icon={<CalendarDays size={14} aria-hidden />}>Partner since {since}</Chip>
      )}
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="pv-num inline-flex items-center gap-1.5 rounded-pill bg-surface/15 px-3 py-1 text-caption font-bold text-surface">
      {icon}
      {children}
    </span>
  );
}

/**
 * Duty, as a row that opens the one sheet.
 *
 * Not a second control. The state shown here is the same `useDuty` value the
 * app bar's pill reads, and tapping it opens the same `DutySheet` the home's
 * duty card opens. There is exactly one place in this app where going on or
 * off duty happens, and this is a door to it.
 */
function DutyRow() {
  const duty = useDuty();
  const [open, setOpen] = useState(false);

  if (duty === null) return null;

  const on = duty.status === "online";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "pv-tap pv-press flex min-h-15 w-full items-center gap-3 rounded-card border px-3.5 py-2.5 text-left",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
          on ? "border-success-line bg-success-surface" : "border-line bg-surface",
        )}
      >
        <span
          className={cn(
            "relative grid h-2.5 w-2.5 shrink-0 place-items-center rounded-pill",
            on ? "bg-success-text" : "bg-warm-400",
          )}
        >
          {on ? <span className="pv-beacon absolute inset-0 rounded-pill text-success-text" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("text-body font-bold", on ? "text-success-text" : "text-text")}>
            {duty.copy.label}
          </span>
          <span
            className={cn(
              "truncate text-caption",
              on ? "text-success-text/80" : "text-text-secondary",
            )}
          >
            {on && duty.activeAreaName !== null
              ? `Working in ${duty.activeAreaName}`
              : "Tap to change your availability"}
          </span>
        </span>
        <ChevronRight
          size={18}
          className={cn("shrink-0", on ? "text-success-text/70" : "text-text-muted")}
          aria-hidden
        />
      </button>
      <DutySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function MeRow({
  href,
  icon,
  label,
  detail,
  last = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "pv-tap flex min-h-15 items-center gap-3.5 px-3.5 py-3 hover:bg-surface-hover",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring",
        last ? "" : "border-b border-line",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-selected-surface text-action-secondary">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-bold text-text">{label}</span>
        <span className="truncate text-caption text-text-secondary">{detail}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
    </Link>
  );
}
