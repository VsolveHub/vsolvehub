"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard, useServerCountdown, type Countdown } from "@vsolve/query";
import { ErrorState, Spinner, cn, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { usePartnerApplication } from "@/features/application/queries";
import { ReadinessChecklist } from "@/features/application/view/readiness-checklist";
import { ApplicationStatusBanner } from "@/features/application/view/status-banner";
import { usePartnerPerformance } from "@/features/earnings/queries";
import { ProjectInvitationBanner } from "@/features/notifications/view/project-invitation-banner";
import { PartnerPresence } from "@/features/presence/view/partner-presence";
import { PARTNER_ROLE, SwitchToPartner } from "@/features/session/partner-shell";
import { usePartnerWorkspaceGrants } from "@/features/workspace/queries";
import { PROJECT_WORKSPACE, resolveWorkspaces } from "@/features/workspace/registry";
import { getApiClient } from "@/lib/api/browser";

import type { WorkItem } from "../model/work-item";
import { useWorkStack } from "../queries";

/**
 * The signed-in home, rebuilt as the one WORK surface.
 *
 * Replaces `features/session/view/dashboard-home.tsx`. The seven application
 * states it answered are unchanged and answered here in the same order — a
 * Partner who has not been approved yet must never see an empty work stack,
 * they must see the screen that tells them where their application stands.
 * Only the **APPROVED** branch's content is new: the merged `useWorkStack`
 * stack replaces `LiveOffersBanner` (A1 offers are stack cards now),
 * `TodayStrip` (A1 jobs are stack cards now) and `PerformanceSummary`
 * (today's money is the header plate below).
 *
 * The status copy is `ApplicationStatusBanner`'s, never restated here. A second
 * table of the same seven states is a second thing to keep true.
 *
 * Ported from the design canvas: `Main.dc.html` (artboard "2 · WORK — the one
 * place") for the populated state, `Empty.dc.html` ("12 · Nothing today") for
 * the empty one. See
 * `docs/superpowers/specs/2026-08-19-partner-tap-first-redesign-design.md`.
 */

const PRIMARY_LINK =
  "inline-flex min-h-12 items-center rounded-control bg-action px-7 font-semibold text-action-text hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

function Home({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </main>
  );
}

export function WorkHome() {
  const query = usePartnerApplication();
  const guard = useAuthGuard(getApiClient());

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <Home title="Your work">
        <p className="flex items-center gap-2 text-text-secondary">
          <Spinner size="sm" />
          Loading your account…
        </p>
      </Home>
    );
  }

  if (query.isError && !isMissing) {
    return (
      <Home title="Your work">
        <ErrorState
          title="We could not load your account"
          message="Nothing you have saved is lost. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void query.refetch()}
        />
      </Home>
    );
  }

  // A 404 is a state, not a failure: this person has never applied.
  if (isMissing || query.data === undefined) {
    return (
      <Home title="Start your application">
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          It takes a few minutes. You can stop and come back — nothing is sent for
          review until you choose to send it.
        </p>
        <div>
          <Link href="/apply/about" className={PRIMARY_LINK}>
            Begin
          </Link>
        </div>
      </Home>
    );
  }

  const application = query.data;

  if (application.status === "APPROVED") {
    /*
      Django selects the alphabetically first grant at login, so a Partner who
      is also a Customer arrives acting as `customer` and every work request
      would 403. The stack is withheld until the session is acting as Partner —
      showing it and letting each request fail is the version of this screen
      that reads as "the app is broken".
    */
    return guard.activeRole === PARTNER_ROLE ? (
      <WorkStack />
    ) : (
      <Home title="Your work">
        <SwitchToPartner inline />
      </Home>
    );
  }

  if (application.status === "SUSPENDED" || application.status === "OFFBOARDED") {
    // No work and no presence control: both are refused by Django in these
    // states, and an appeal runs through support rather than this screen.
    return (
      <Home title="Your account">
        <ApplicationStatusBanner application={application} />
      </Home>
    );
  }

  if (application.status === "SUBMITTED" || application.status === "UNDER_REVIEW") {
    return (
      <Home title="Your application">
        <ApplicationStatusBanner application={application} />
        <p className="max-w-prose text-sm leading-6 text-text-secondary">
          Job offers start once a reviewer has approved you. There is nothing
          waiting on you in the meantime, and you do not need to check back — we
          will message you.
        </p>
      </Home>
    );
  }

  // DRAFT and CHANGES_REQUIRED: the work is theirs, and it is on `/apply`.
  return (
    <Home title="Your application">
      <ApplicationStatusBanner application={application} />
      <ReadinessChecklist application={application} />
      <div className="border-t border-line pt-4">
        <Link href="/apply/review" className={PRIMARY_LINK}>
          Continue your application
        </Link>
      </div>
    </Home>
  );
}

/* --------------------------------------------------------------------------
   The approved Partner's screen
   -------------------------------------------------------------------------- */

/**
 * Everything an approved Partner is on the hook for, in one sorted stack.
 *
 * Its own component so that its hooks are unconditional: the gate above returns
 * early for six of the seven application states, and running `useWorkStack`'s
 * six underlying queries inside that `if` chain would be a conditional hook.
 *
 * `min-h-[calc(100dvh-9rem)]` rather than `min-h-screen`: `PartnerShell` already
 * owns a sticky top bar and a fixed bottom tab bar, so a full-viewport main
 * inside it scrolls by exactly the height of that chrome even with nothing in
 * the stack. 9rem is that allowance.
 */
function WorkStack() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();

  /*
    The A5 project workspace, resolved only so `ProjectInvitationBanner` can be
    handed the grant it needs. This is the same `usePartnerWorkspaceGrants`
    query the shell already runs, so TanStack serves it from cache rather than
    issuing a second request. The banner's prop is required and non-nullable,
    so a Partner without the A5 grant renders no banner at all rather than one
    holding a fabricated workspace — and the banner itself still re-checks
    `enquiry.view` on the grant before it reads the notification feed.
  */
  const grants = usePartnerWorkspaceGrants();
  const projectWorkspace =
    resolveWorkspaces(grants.grants ?? []).find(
      (workspace) => workspace.key === PROJECT_WORKSPACE,
    ) ?? null;

  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col bg-[linear-gradient(180deg,var(--color-warm-25)_0%,var(--color-canvas)_100%)]">
      {/* The screen is pictures and numbers; the landmark still needs a name. */}
      <h1 className="sr-only">Your work</h1>

      <TodayPlate netPaise={performance.data?.today_net_paise ?? null} />

      <div className="flex flex-1 flex-col gap-3.5 px-4 pt-3.5 pb-3">
        {/* An interrupt, so it sits above everything it interrupts — the same
            position it held on the A5 workspace home this screen replaces. It
            renders nothing at all when no project enquiry is waiting. */}
        {projectWorkspace ? <ProjectInvitationBanner workspace={projectWorkspace} /> : null}

        {/* The one presence control in the app, shared with `/me` rather than
            copied — see `PartnerPresence`'s own reasoning against a second one. */}
        <PartnerPresence />

        <StackBody stack={stack} />
      </div>
    </main>
  );
}

/**
 * Loading and failure for the whole stack at once, because that is what
 * `useWorkStack` reports.
 *
 * It merges five queries and is all-or-nothing on both: one pending source
 * makes the whole hook pending, and one failed source empties `items` and sets
 * `error`. So there is one spinner and one error state here, never five — a
 * screen showing four working sources and quietly hiding the broken fifth would
 * tell a Partner they have no offers when the offers endpoint is down.
 *
 * No retry button: the hook composes six query objects and exposes no refetch,
 * and a reload is the recovery that actually re-runs all of them.
 */
function StackBody({ stack }: { stack: ReturnType<typeof useWorkStack> }) {
  if (stack.isPending) {
    return (
      <p className="flex flex-1 items-center justify-center gap-2 py-16 text-text-secondary">
        <Spinner size="sm" />
        Loading your work…
      </p>
    );
  }

  if (stack.error) {
    return (
      <ErrorState
        title="We could not load your work"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (stack.items.length === 0) return <EmptyWork />;

  return (
    <div className="flex flex-col gap-3">
      {stack.items.map((item) => (
        <WorkCard key={item.key} item={item} />
      ))}
    </div>
  );
}

/**
 * Today's money, on the depth gradient (`navy-700 → navy-900`).
 *
 * `today_net_paise` is read straight off `PartnerPerformance` — the endpoint
 * publishes today, this month and lifetime as their own fields, so nothing here
 * reduces a daily series to find it.
 *
 * The sun is the canvas's own glyph for this plate, and it is `days` in the
 * transcribed pictogram set (same rays, same 4.2 centre). It says "today"; the
 * number beside it says how much.
 */
function TodayPlate({ netPaise }: { netPaise: number | null }) {
  return (
    <div className="px-4 pt-3.5">
      <div className="flex items-center gap-3 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-3.5 shadow-card">
        <Pictogram name="days" className="h-7.5 w-7.5 shrink-0 text-action-hover" />
        <span className="text-[2.75rem] font-extrabold leading-none tracking-[-0.02em] text-surface">
          {netPaise === null ? "—" : formatMoney(netPaise)}
        </span>
        <span className="sr-only">earned today</span>
      </div>
    </div>
  );
}

/**
 * Nothing waiting — one drawn medallion and no invented content.
 *
 * `Empty.dc.html` also draws a "3 jobs within 12 km" pill and two "widen your
 * radius" / "add a trade" fix buttons beneath it. All three are mock numbers
 * with no Partner-facing endpoint behind them, so they are deliberately not
 * ported: a made-up count of nearby work on the screen a Partner checks when
 * they have none is the worst possible place to invent a figure.
 */
function EmptyWork() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16">
      <div className="relative grid h-42 w-42 place-items-center">
        <span className="absolute inset-0 rounded-full bg-surface-sunken" />
        <span className="absolute inset-5.5 rounded-full border-2 border-dashed border-[var(--color-warm-300)]" />
        <Pictogram name="all-work" className="relative h-21 w-21 text-[var(--color-warm-400)]" />
      </div>
      <p className="sr-only">You have no work waiting right now.</p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The four card states
   -------------------------------------------------------------------------- */

/**
 * One card per `WorkItem`, branched on the urgency that gives it its colour.
 *
 * The four states are the design's whole timeline — somebody asked, I answered,
 * I'm doing it, I got paid — and each one is a different card in
 * `Main.dc.html`, not one card with a different border. See `WorkUrgency`.
 */
function WorkCard({ item }: { item: WorkItem }) {
  switch (item.urgency) {
    case "live":
      return <LiveOfferCard item={item} />;
    case "needs_price":
      return <NeedsPriceCard item={item} />;
    case "settled":
      return <SettledCard item={item} />;
    case "doing":
      return <DoingCard item={item} />;
  }
}

/** Every card is a tap target first. 56px is the floor the design sets. */
const CARD =
  "flex min-h-14 flex-col gap-2.75 rounded-card p-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const TILE = "grid h-13 w-13 shrink-0 place-items-center rounded-[0.9375rem]";

/** A 56px full-width action bar drawn inside the card's own link. */
const BAR = "flex h-14 items-center justify-center gap-2 rounded-[0.8125rem]";

/**
 * A picture and a number, which is the only way this app states a fact.
 *
 * `Know — the facts, always as picture plus number` is the canvas's own name
 * for this set, and the rule is exactly that: never the number alone, never the
 * word.
 *
 * One size for every fact on the screen, at the pictogram's own 24px default.
 * The canvas draws two (17px beside 15px text, 21px beside 19px), but
 * `Pictogram` hard-codes `h-6 w-6` and `cn` is `clsx` rather than
 * `tailwind-merge` — so a smaller class does not replace that default, it joins
 * it, and the cascade then resolves the tie by stylesheet order in Tailwind's
 * favour rather than the caller's. Sizing every fact at or above the default
 * sidesteps that silently-wrong outcome, and a larger picture beside a larger
 * number is the direction this redesign is going anyway.
 */
function Fact({ name, children }: { name: PictogramName; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[1.1875rem] font-bold">
      <Pictogram name={name} className="shrink-0" />
      {children}
    </span>
  );
}

/** "9:00 am" in the device's own zone. Null-safe, so a card can just ask. */
function clockTime(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(at);
}

/** The headline number, or the canvas's "₹ ?" for something not yet priced. */
function money(amountPaise: number | null): string {
  return amountPaise === null ? "₹ ?" : formatMoney(amountPaise);
}

/**
 * What the card is worth, said out loud — and for an engagement, hedged.
 *
 * `WorkItem.amountPaise` is a net payout for an offer and for a job, and is
 * **not** one for an engagement: there it is `staged_total_paise`, the agreed
 * total, and whether the platform's cut sits inside it or on top of it is
 * `commission_treatment`, an unenumerated field the model layer records rather
 * than decides. So an engagement's figure is announced as the agreement's
 * value, never as money this Partner will receive.
 */
function spokenAmount(item: WorkItem): string {
  if (item.amountPaise === null) return "no price yet";
  const amount = formatMoney(item.amountPaise);
  return item.kind === "engagement" ? `agreed total ${amount}` : amount;
}

function cardLabel(item: WorkItem): string {
  return `${item.accessibleName}, ${spokenAmount(item)}`;
}

/**
 * A clock is running on this one — the single hottest card on the screen.
 *
 * Both offer sources land here and share the treatment on purpose: an A3 crew
 * offer and an A1 direct offer are different records on different endpoints,
 * but to a Partner looking at this stack they are the same thing — somebody is
 * offering work and there is a deadline on the answer. `WorkItem` says so in as
 * many words, and names `href` as what separates them. It does: an A3 offer
 * opens its own detail screen, an A1 offer opens the inbox that answers it.
 *
 * ## The lapse guard, and why it lives here rather than in the adapter
 *
 * `toWorkItems` filters A3 offers through `isOfferLive` against the server's
 * own `server_now`, but deliberately applies no equivalent clock to A1 offers —
 * Celery owns those deadlines and `status` is the truth. The consequence is
 * that an A1 offer whose deadline has passed but whose next five-second poll
 * has not landed sorts to the very top of the stack, since the comparator reads
 * a dead deadline as the most urgent thing a Partner owns.
 *
 * So the card checks. `useServerCountdown` measures against the calibrated
 * server clock rather than the device's, and a lapsed one drops the heat
 * gradient and the countdown instead of shouting. It is not removed: the server
 * decides what is expired, this only decides what to shout about.
 */
function LiveOfferCard({ item }: { item: WorkItem }) {
  const countdown = useServerCountdown(item.respondsBy, 1000);
  const lapsed = countdown?.isExpired ?? false;

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(
        CARD,
        lapsed
          ? "border border-line bg-surface"
          : "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-[0_4px_12px_rgb(214_94_0/0.32)]",
      )}
    >
      <span className="flex items-center gap-2.75">
        <span className={cn(TILE, lapsed ? "bg-surface-sunken" : "bg-surface")}>
          <Pictogram name="now" className="h-7.5 w-7.5 text-text" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-text">
          <span className="text-[2.0625rem] font-extrabold leading-none tracking-[-0.02em]">
            {money(item.amountPaise)}
          </span>
          {item.areaLabel ? (
            <Fact name="distance">
              <span className="truncate">{item.areaLabel}</span>
            </Fact>
          ) : null}
        </span>

        {countdown && !lapsed ? <CountdownDial countdown={countdown} /> : null}
      </span>
    </Link>
  );
}

/**
 * `mm:ss` at card size.
 *
 * Not the progress ring from `Offer.dc.html` — that belongs to the offer detail
 * screen, and drawing an arc here would need a window length no endpoint
 * publishes, so the arc's denominator would be invented. The bezel is the
 * canvas's shape; the digits are the only part that is measured.
 *
 * The digits are `aria-hidden` and the coarse `announce` string is what is read
 * out: a per-second reading of a ticking clock is unusable with a screen
 * reader.
 */
function CountdownDial({ countdown }: { countdown: Countdown }) {
  return (
    <span className="grid h-13.5 w-13.5 shrink-0 place-items-center rounded-full bg-[rgb(0_17_46/0.13)]">
      <span aria-hidden className="text-sm font-extrabold tracking-[-0.02em] text-text">
        {countdown.display}
      </span>
      <span className="sr-only">{countdown.announce}</span>
    </span>
  );
}

/**
 * Waiting on a price from this Partner — plain white, orange number.
 *
 * The canvas draws two photo thumbnails on this card. `WorkItem` publishes no
 * photos and the enquiry summary the stack is built from carries none, so they
 * are not ported rather than filled with placeholder tiles.
 */
function NeedsPriceCard({ item }: { item: WorkItem }) {
  const at = clockTime(item.whenIso);

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(CARD, "border border-line bg-surface")}
    >
      <span className="flex items-center gap-2.75">
        <span className={cn(TILE, "bg-surface-sunken")}>
          <Pictogram name="new" className="h-7.5 w-7.5 text-signal-700" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <span className="text-[2.0625rem] font-extrabold leading-none tracking-[-0.02em] text-signal-700">
            {money(item.amountPaise)}
          </span>
          {at ? (
            <span className="text-text-secondary">
              <Fact name="time">{at}</Fact>
            </span>
          ) : null}
        </span>
      </span>

      <span className={cn(BAR, "bg-action shadow-[0_2px_0_var(--color-action-active)]")}>
        <Pictogram name="price" className="h-6.75 w-6.75 text-action-text" />
        <Pictogram name="go" className="h-6.75 w-6.75 text-action-text" />
      </span>
    </Link>
  );
}

/**
 * Being done now — white with the navy spine.
 *
 * Two things the canvas draws here are deliberately absent. The five progress
 * dots have no field behind them: neither a visit nor an engagement publishes a
 * step count on the list read this stack is built from. And the large
 * call-customer button needs a phone number, which the offer/visit projections
 * withhold until the Partner is on the job — `/work/jobs/[id]` is where that
 * lives, and this card opens it.
 *
 * A job leads with its start time and an engagement with its money, because an
 * engagement publishes no schedule of its own — its stages carry `scheduled_on`
 * and the agreement does not, so `whenIso` is null for every one of them. The
 * glyph beside the number says which is which.
 */
function DoingCard({ item }: { item: WorkItem }) {
  const at = clockTime(item.whenIso);

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(
        CARD,
        "border border-line border-l-[6px] border-l-action-secondary bg-surface",
      )}
    >
      <span className="flex items-center gap-2.75">
        <span
          className={cn(
            TILE,
            "bg-[linear-gradient(150deg,var(--color-navy-300),var(--color-navy-500))]",
          )}
        >
          <Pictogram name="doing" className="h-7.5 w-7.5 text-surface" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1.75 text-text">
          {at ? (
            <span className="text-action-secondary">
              <Fact name="time">{at}</Fact>
            </span>
          ) : (
            <span className="text-[1.8125rem] font-extrabold leading-none tracking-[-0.02em]">
              {money(item.amountPaise)}
            </span>
          )}
          {item.areaLabel ? (
            <span className="text-action-secondary">
              <Fact name="distance">
                <span className="truncate">{item.areaLabel}</span>
              </Fact>
            </span>
          ) : null}
        </span>
      </span>

      <span
        className={cn(BAR, "bg-action-secondary shadow-[0_2px_0_var(--color-navy-900)]")}
      >
        <Pictogram name="go" className="h-7 w-7 text-action-secondary-text" />
      </span>
    </Link>
  );
}

/**
 * Settled — green surface, and the padlock that says the money is held.
 *
 * Only a completed A1 visit reaches this state. An engagement is never mapped
 * to `settled` by the adapter, which is what keeps the "you got paid" treatment
 * off the one figure that is not a payout.
 */
function SettledCard({ item }: { item: WorkItem }) {
  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-card border border-success-line bg-success-surface px-3.5 py-2.75",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-text">
        <Pictogram name="done" className="h-6.5 w-6.5 text-surface" />
      </span>
      <span className="flex-1 text-[1.8125rem] font-extrabold leading-none tracking-[-0.02em] text-success-text">
        {money(item.amountPaise)}
      </span>
      <Pictogram name="held" className="h-6 w-6 shrink-0 text-success-text" />
    </Link>
  );
}
