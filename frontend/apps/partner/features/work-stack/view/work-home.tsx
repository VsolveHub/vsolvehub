"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useAuthGuard } from "@vsolve/query";
import { Button, ErrorState, cn, formatMoney } from "@vsolve/ui";
import { ChevronRight, Power } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Pictogram } from "@/components/pictogram";
import { usePartnerApplication } from "@/features/application/queries";
import { ReadinessChecklist } from "@/features/application/view/readiness-checklist";
import { ApplicationStatusBanner } from "@/features/application/view/status-banner";
import { usePartnerPerformance, type PartnerPerformance } from "@/features/earnings/queries";
import { useDuty } from "@/features/presence/duty-context";
import { PARTNER_ROLE, SwitchToPartner } from "@/features/session/partner-shell";
import { DutySheet } from "@/features/shell/view/duty-control";
import { Block, Screen, SectionHeading } from "@/features/shell/view/screen";
import { SkeletonHome, SkeletonList } from "@/features/shell/view/skeletons";
import { usePartnerProfile } from "@/features/profile/queries";
import { getApiClient } from "@/lib/api/browser";

import type { WorkItem } from "../model/work-item";
import { useWorkStack } from "../queries";
import { WaitingRadar } from "./waiting-radar";
import { WorkCard } from "./work-card";

/**
 * The signed-in home — the screen a Partner opens twenty times a day.
 *
 * It answers three questions in this order, because that is the order they are
 * asked: **am I on duty**, **what have I made**, **is anything waiting on me**.
 *
 * ## What moved
 *
 * The duty control used to be a full settings card sitting in this flow, and
 * an identical second copy sat on `/me`. It is now one provider
 * (`features/presence/duty-context.tsx`) with a permanent indicator in the app
 * bar — so it is answerable from every screen — plus the one card below, which
 * is loud when the Partner is off duty and a thin confirmation when they are
 * on. That inversion is the point: the control needs to shout exactly when it
 * is the reason nothing is happening.
 *
 * ## The seven application states are unchanged
 *
 * A Partner who has not been approved must never see an empty work stack; they
 * must see where their application stands. Only the APPROVED branch's content
 * is redesigned. The status copy stays `ApplicationStatusBanner`'s and is never
 * restated here — a second table of the same seven states is a second thing to
 * keep true.
 */

const PRIMARY_LINK =
  "pv-tap pv-press inline-flex h-13 items-center justify-center rounded-control bg-action px-7 text-title text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

function Home({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen>
      <Block gap="lg" className="py-5">
        <h1 className="text-headline text-text">{title}</h1>
        {children}
      </Block>
    </Screen>
  );
}

export function WorkHome() {
  const query = usePartnerApplication();
  const guard = useAuthGuard(getApiClient());

  const isMissing = query.error instanceof ApiRequestError && query.error.status === 404;

  if (query.isPending) {
    return (
      <Screen>
        <Block gap="md" className="py-4">
          <SkeletonHome />
        </Block>
      </Screen>
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
        <p className="max-w-prose text-body leading-relaxed text-text-secondary">
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
    // No work and no duty control: both are refused by Django in these states,
    // and an appeal runs through support rather than this screen.
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
        <p className="max-w-prose text-body leading-relaxed text-text-secondary">
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
 * Its own component so the hooks below are unconditional — the gate above
 * returns early for six of the seven application states, and running
 * `useWorkStack`'s six underlying queries inside that `if` chain would be a
 * conditional hook.
 */
function WorkStack() {
  const stack = useWorkStack();
  const performance = usePartnerPerformance();

  /*
    What is on the Partner's plate *right now*, and what is merely on file.

    The stack merges every record this vendor touches, which on a working
    account means a permanent tail of quotes sent and jobs already settled. On
    the home that tail is noise. So the home carries the three urgencies that
    are a call to action, and `/work/all` carries the same stack unfiltered.
    The split is by whose move it is, never by count.
  */
  const needsYou = stack.items.filter(
    (item) => item.urgency === "live" || item.urgency === "needs_price" || item.urgency === "doing",
  );

  return (
    <Screen>
      <Block gap="md" className="pt-4 pb-3">
        <Greeting />
        <DutyCard />
        <TodayPlate
          netPaise={performance.data?.today_net_paise ?? null}
          jobs={performance.data?.today_jobs ?? null}
        />
        <MonthStrip performance={performance.data ?? null} />
      </Block>

      <Block gap="sm" className="flex-1 pt-4 pb-6">
        <StackBody stack={stack} needsYou={needsYou} />
      </Block>
    </Screen>
  );
}

/**
 * Who is reading this screen.
 *
 * The old home opened with a `sr-only` heading and went straight to a number.
 * Every other tab addresses the Partner in the second person — "Your work",
 * "Earned today" — while the screen they open most said nothing to them at all.
 * The name comes from `usePartnerProfile`, which `/me` and `/me/profile`
 * already share under one cache entry, so this costs no request.
 *
 * Renders the time-of-day line alone until the name arrives, rather than a
 * skeleton: a shimmering rectangle in the first line of the screen is the most
 * distracting possible place for one, and the greeting is not why anyone is
 * here.
 */
function Greeting() {
  const profile = usePartnerProfile();
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // First name only. Full legal names run long and this line is 360px wide.
  const first = profile.data?.display_name.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="flex items-baseline justify-between gap-3 pt-0.5">
      <h1 className="min-w-0 truncate text-headline text-text">
        {part}
        {first === null ? "" : `, ${first}`}
      </h1>
    </div>
  );
}

/**
 * Duty, sized by how much it matters right now.
 *
 * Off duty this is the loudest thing on the screen, because it is the reason
 * every number below it has stopped moving. On duty it collapses to a single
 * confirming line — the state is already in the app bar, and a Partner who is
 * working does not need a second panel telling them so.
 *
 * That asymmetry is the whole design. The control this replaces was the same
 * size in both states: a settings card that took a third of the fold whether or
 * not it had anything to say.
 */
function DutyCard() {
  const duty = useDuty();
  const [open, setOpen] = useState(false);

  if (duty === null) return null;

  // `checking` is not `offline`. Shouting "you are off duty" at somebody whose
  // session is still being confirmed is the flicker `presenceStatus` exists to
  // prevent, in its loudest possible form.
  if (duty.status === "checking" || duty.status === "connecting") {
    return (
      <div className="flex h-13 items-center gap-2.5 rounded-card border border-line bg-surface px-3.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-pill bg-warm-400" />
        <span className="text-body font-semibold text-text-secondary">{duty.copy.label}…</span>
      </div>
    );
  }

  if (duty.status === "online") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pv-tap pv-press flex h-13 items-center gap-2.5 rounded-card border border-success-line bg-success-surface px-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center rounded-pill bg-success-text">
          <span className="pv-beacon absolute inset-0 rounded-pill text-success-text" />
        </span>
        <span className="min-w-0 flex-1 truncate text-body font-bold text-success-text">
          On duty
          {duty.activeAreaName === null ? "" : ` in ${duty.activeAreaName}`}
        </span>
        <ChevronRight size={18} className="shrink-0 text-success-text/70" aria-hidden />
        <DutySheet open={open} onClose={() => setOpen(false)} />
      </button>
    );
  }

  // Off duty, stale, location refused, or unknown — every one of these means
  // work is not reaching this Partner, and every one is fixed in the sheet.
  const isFault = duty.status === "stale" || duty.status === "location_denied" || duty.status === "unknown";

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-card border p-4",
          isFault
            ? "border-warning-line bg-warning-surface"
            : "border-line bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)]",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-pill",
              isFault ? "bg-warning-text/15 text-warning-text" : "bg-surface/15 text-surface",
            )}
          >
            <Power size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-title", isFault ? "text-warning-text" : "text-surface")}>
              {duty.copy.label}
            </p>
            <p
              className={cn(
                "mt-0.5 text-caption leading-snug",
                isFault ? "text-warning-text/85" : "text-navy-200",
              )}
            >
              {duty.copy.detail}
            </p>
          </div>
        </div>

        <Button block onClick={() => setOpen(true)}>
          {isFault ? "Fix this" : "Go on duty"}
        </Button>
      </div>
      <DutySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Today's money, on the depth gradient.
 *
 * `today_net_paise` is read straight off `PartnerPerformance` — the endpoint
 * publishes today, this month and lifetime as their own fields, so nothing here
 * reduces a daily series to find it.
 */
function TodayPlate({ netPaise, jobs }: { netPaise: number | null; jobs: number | null }) {
  return (
    <Link
      href="/money"
      aria-label={`Earned today ${netPaise === null ? "not yet known" : formatMoney(netPaise)}. Open your money.`}
      className="pv-tap pv-press flex items-center gap-3.5 rounded-card bg-[linear-gradient(160deg,var(--color-navy-700)_0%,var(--color-navy-900)_100%)] p-4 shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <Pictogram name="days" size="lg" className="shrink-0 text-action-hover" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-micro uppercase text-navy-200">Earned today</span>
        <span className="pv-num truncate text-hero text-surface">
          {netPaise === null ? "—" : formatMoney(netPaise)}
        </span>
      </span>
      {/* Zero is a real answer and says so. A blank space where a count belongs
          reads as a screen that failed to load, which is the one thing an idle
          Partner must not conclude. */}
      {jobs === null ? null : (
        <span className="ml-auto flex shrink-0 flex-col items-end text-caption font-semibold leading-snug text-navy-200">
          {jobs === 0 ? (
            <>
              <span>No jobs</span>
              <span>yet today</span>
            </>
          ) : (
            <>
              <span className="pv-num">
                {jobs} {jobs === 1 ? "job" : "jobs"}
              </span>
              <span>finished</span>
            </>
          )}
        </span>
      )}
    </Link>
  );
}

/**
 * The two figures that put today in context, and nothing beyond them.
 *
 * `PartnerPerformance` publishes seven numbers; three belong on a home screen.
 * Today is the plate above. This month answers "am I having a good month", and
 * the average answers "compared to what" — the only reason a single month's
 * figure means anything. Lifetime totals and the daily series live on `/money`,
 * which already renders them; repeating them here would make the home a worse
 * version of that screen.
 *
 * Renders nothing at all while the read is in flight. Three skeleton tiles here
 * would draw the eye to the least important row on the screen, and the row is
 * supporting context — its absence for a second costs nothing.
 */
function MonthStrip({ performance }: { performance: PartnerPerformance | null }) {
  if (performance === null) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      <Metric label="This month" value={formatMoney(performance.month_net_paise)} />
      <Metric
        label={performance.month_jobs === 1 ? "Job done" : "Jobs done"}
        value={String(performance.month_jobs)}
      />
      <Metric label="Usual month" value={formatMoney(performance.average_monthly_net_paise)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface px-3 py-2.5">
      <span className="pv-num truncate text-title leading-none tracking-[-0.02em] text-text">
        {value}
      </span>
      <span className="truncate text-micro tracking-normal text-text-muted">{label}</span>
    </div>
  );
}

/**
 * Loading and failure for the whole stack at once, because that is what
 * `useWorkStack` reports.
 *
 * It merges six queries and is all-or-nothing on both: one pending source makes
 * the whole hook pending, and one failed source empties `items` and sets
 * `error`. So there is one skeleton here and one error state, never six — a
 * screen showing five working sources and quietly hiding the broken sixth would
 * tell a Partner they have no offers when the offers endpoint is down.
 */
function StackBody({
  stack,
  needsYou,
}: {
  stack: ReturnType<typeof useWorkStack>;
  needsYou: readonly WorkItem[];
}) {
  if (stack.isPending) {
    return (
      <>
        <SectionHeading>Needs you</SectionHeading>
        <SkeletonList rows={2} label="Loading your work" />
      </>
    );
  }

  if (stack.error) {
    return (
      <ErrorState
        title="We could not load your work"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        /* `useWorkStack` composes six query objects and exposes no refetch, so a
           reload is the recovery that actually re-runs all of them. */
        onAction={() => window.location.reload()}
      />
    );
  }

  if (needsYou.length === 0) return <WaitingForWork />;

  return (
    <>
      <SectionHeading count={needsYou.length}>Needs you</SectionHeading>
      {needsYou.map((item, index) => (
        <WorkCard key={item.key} item={item} index={index} />
      ))}
    </>
  );
}

/**
 * Nothing needs this Partner — the screen they see most.
 *
 * Whether the radar sweeps is decided by duty, not by the stack: an off-duty
 * Partner has no dispatch running for them and must not be shown an animation
 * claiming otherwise.
 *
 * ## Why this reads duty from the provider rather than from storage
 *
 * It used to read `localStorage` directly through `useSyncExternalStore`,
 * because the presence state lived inside a sibling component and there was no
 * other way to observe it. That made the radar agree with the duty control only
 * by coincidence — a stored session id that Django had already refused still
 * read as "online" here, so the radar swept for a Partner nobody was
 * dispatching to. `useDuty` is the confirmed server answer, which is the only
 * thing this animation is allowed to assert.
 */
function WaitingForWork() {
  const duty = useDuty();
  return <WaitingRadar isOnline={duty?.isOnDuty ?? false} />;
}

/**
 * Re-exported so `all-work.tsx` — which imported `WorkCard` from this module
 * before the cards moved into their own file — keeps working against one card
 * implementation rather than growing a second import path to the same component.
 */
export { WorkCard } from "./work-card";
