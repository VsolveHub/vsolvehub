"use client";

import { ApiRequestError } from "@vsolve/api-client";
import { useServerCountdown, type Countdown } from "@vsolve/query";
import { ErrorState, Spinner, cn, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { usePartnerApplication } from "@/features/application/queries";
import { ReadinessChecklist } from "@/features/application/view/readiness-checklist";
import { ApplicationStatusBanner } from "@/features/application/view/status-banner";
import { usePartnerPerformance, type PartnerPerformance } from "@/features/earnings/queries";
import { readStoredSession } from "@/features/presence/model/stored-session";
import { PartnerPresence } from "@/features/presence/view/partner-presence";

import type { WorkItem } from "../model/work-item";
import { useWorkStack } from "../queries";
import { WaitingRadar } from "./waiting-radar";

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
    return <WorkStack />;
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
    What is on the Partner's plate *right now*, and what is merely on file.

    The stack merges every record this vendor touches, which on a working
    account means a permanent tail of quotes they have sent and jobs already
    settled. On the home that tail is noise — it pushed today's money and the
    availability control off the top of a real screen and made "nothing waiting"
    unreachable for anybody with any history at all.

    So the home carries the three urgencies that are a call to action, and
    `/work/all` carries the same stack unfiltered — reached through the Work
    tab, which is why the home draws no link of its own to it. The split is by
    whose move it is, never by count.
  */
  const needsYou = stack.items.filter(
    (item) => item.urgency === "live" || item.urgency === "needs_price" || item.urgency === "doing",
  );

  return (
    <main className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--color-ink-900)]">
      <h1 className="sr-only">Your work</h1>

      {/* Map-style hero — earnings front and centre */}
      <div className="relative flex shrink-0 flex-col px-4 pb-16 pt-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-surface) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent_0%,var(--color-ink-900)_100%)]"
        />

        <TodayPlate
          netPaise={performance.data?.today_net_paise ?? null}
          jobs={performance.data?.today_jobs ?? null}
        />

        <MonthStrip performance={performance.data ?? null} />
      </div>

      {/* Bottom sheet — availability + work stack */}
      <div className="relative -mt-10 flex flex-1 flex-col rounded-t-[1.75rem] bg-surface shadow-[0_-12px_48px_color-mix(in_oklab,var(--color-ink-900)_25%,transparent)]">
        <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-line" />

        <div className="px-4 pt-4 pb-2">
          <PartnerPresence variant="driver" />
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-2">
          <StackBody stack={stack} needsYou={needsYou} />
        </div>
      </div>
    </main>
  );
}

/**
 * The two figures that put today in context, and nothing beyond them.
 *
 * `PartnerPerformance` publishes seven numbers; three belong on a home screen.
 * Today is the hero plate above. This month answers "am I having a good month",
 * and the average answers "compared to what" — which is the only reason a single
 * month's figure means anything. Lifetime totals and the daily series are
 * genuinely interesting and genuinely not urgent: they live on `/money`, which
 * already renders them, and repeating them here would make the home a worse
 * version of that screen.
 *
 * Renders nothing at all while the read is in flight. Three skeleton tiles above
 * the fold would draw the eye to the least important row on the screen, and the
 * row is supporting context — its absence for a second costs nothing.
 */
function MonthStrip({ performance }: { performance: PartnerPerformance | null }) {
  if (performance === null) return null;

  return (
    <div className="relative z-10 mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
    <div className="flex min-w-[7.5rem] shrink-0 snap-start flex-col gap-0.5 rounded-2xl border border-surface/10 bg-surface/8 px-3.5 py-2.5 backdrop-blur-sm">
      <span className="truncate text-[1.0625rem] font-extrabold leading-none tracking-[-0.02em] text-surface">
        {value}
      </span>
      <span className="truncate text-[0.6875rem] font-medium text-surface/55">{label}</span>
    </div>
  );
}

/**
 * Loading and failure for the whole stack at once, because that is what
 * `useWorkStack` reports.
 *
 * It merges six queries and is all-or-nothing on both: one pending source
 * makes the whole hook pending, and one failed source empties `items` and sets
 * `error`. So there is one spinner and one error state here, never six — a
 * screen showing five working sources and quietly hiding the broken sixth would
 * tell a Partner they have no offers when the offers endpoint is down.
 *
 * No retry button: the hook composes six query objects and exposes no refetch,
 * and a reload is the recovery that actually re-runs all of them.
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

  if (needsYou.length === 0) return <WaitingForWork />;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
          Needs you
        </h2>
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-text-muted">
          {needsYou.length}
        </span>
      </div>
      {needsYou.map((item) => (
        <WorkCard key={item.key} item={item} />
      ))}
    </section>
  );
}

/**
 * Nothing needs this Partner — the screen they see most, and the one the old
 * stack answered with a blank rectangle.
 *
 * Whether the radar sweeps is decided by presence, not by the stack: an offline
 * Partner has no dispatch running for them and must not be shown an animation
 * claiming otherwise. `readStoredSession` is the same source
 * `PresencePanel` restores from on load, read here rather than lifted into
 * shared state because it is a browser fact both components observe, not a
 * value either of them owns.
 *
 * `useSyncExternalStore` for the same reason `PresencePanel` uses it: reading
 * storage during render makes the server and client trees disagree, and the
 * flicker that produces is a Partner watching their availability appear to drop
 * and come back.
 */
function WaitingForWork() {
  const storedSession = useSyncExternalStore(
    subscribeToNothing,
    () => readStoredSession() !== null,
    () => false,
  );

  return <WaitingRadar isOnline={storedSession} />;
}

/** Storage does not change under us within a paint; nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
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
function TodayPlate({ netPaise, jobs }: { netPaise: number | null; jobs: number | null }) {
  return (
    <div className="relative z-10 flex flex-col gap-1 pt-2">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-surface/50">
        Earned today
      </span>
      <div className="flex items-end justify-between gap-4">
        <span
          data-numeric
          className="text-[clamp(2.75rem,12vw,3.5rem)] font-extrabold leading-none tracking-[-0.03em] text-surface"
        >
          {netPaise === null ? "—" : formatMoney(netPaise)}
        </span>
        {jobs === null ? null : (
          <span className="mb-1 flex shrink-0 flex-col items-end text-right text-sm font-medium leading-snug text-surface/55">
            {jobs === 0 ? (
              <>
                <span>No jobs</span>
                <span>yet today</span>
              </>
            ) : (
              <>
                <span>
                  {jobs} {jobs === 1 ? "job" : "jobs"}
                </span>
                <span>finished</span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/*
  `EmptyWork` lived here — a static dashed medallion for "nothing waiting".

  It is `WaitingRadar` now (`./waiting-radar.tsx`), for two reasons. It was
  effectively unreachable: the old home rendered the whole stack, so
  `items.length` was only ever zero for a Partner with no history at all, and
  every established vendor saw a tail of settled cards instead. And a still
  medallion answers "do you have work for me?" the same way a screen that failed
  to load does. The radar says the dispatch is running — and stops sweeping when
  the Partner is offline, because then it isn't.

  What the canvas drew and neither version ports: a "3 jobs within 12 km" pill
  and "widen your radius" / "add a trade" buttons. All three are figures with no
  Partner-facing endpoint behind them, and the screen a vendor checks when they
  have no work is the worst possible place to invent one.
*/

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
export function WorkCard({ item }: { item: WorkItem }) {
  switch (item.urgency) {
    case "live":
      return <LiveOfferCard item={item} />;
    case "needs_price":
      return <NeedsPriceCard item={item} />;
    case "settled":
      return <SettledCard item={item} />;
    case "answered":
      return <AnsweredCard item={item} />;
    case "not_chosen":
      return <OutcomeCard item={item} />;
    case "closed":
      return <OutcomeCard item={item} />;
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
 * A picture and a value, at the size the design sets for a card fact.
 *
 * Sizing is a `size` prop now rather than a className, so the 16px the canvas
 * actually draws is what renders — the old comment here explained that a
 * smaller class lost its fight with `Pictogram`'s hard-coded default and that
 * every fact was therefore sized *up* to dodge it. That defect is fixed at the
 * component (`components/pictogram.tsx`), so this can be the size it wants.
 *
 * The glyph is decorative and the value carries the meaning. Where the glyph
 * alone is ambiguous — `time` reads as both "starts at" and "how long" — the
 * caller passes a `label`, which renders above the value at a third its size.
 */
function Fact({
  name,
  label,
  children,
}: {
  name: PictogramName;
  label?: string;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Pictogram name={name} size="sm" className="shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        {label === undefined ? null : (
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.04em] opacity-70">
            {label}
          </span>
        )}
        <span className="truncate text-[0.9375rem] font-bold">{children}</span>
      </span>
    </span>
  );
}

/**
 * When this card happens, formatted as what it actually is.
 *
 * A scheduled visit has a slot and reads "9:00 am". An enquiry has a **day** the
 * customer picked, which the server publishes as a `date-time` at midnight — so
 * formatting it as a clock printed "12:00 am" on every enquiry card in the
 * stack. It reads "12 Sep" now. `WorkItem.whenIsDay` is what decides; see its
 * doc comment for why the value is not sniffed.
 */
function whenLabel(item: WorkItem): string | null {
  if (item.whenIso === null) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;

  return new Intl.DateTimeFormat(
    "en-IN",
    item.whenIsDay
      ? { day: "numeric", month: "short" }
      : { hour: "numeric", minute: "2-digit" },
  ).format(at);
}

function dateLabel(item: WorkItem): string | null {
  if (item.whenIso === null) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

function startTimeLabel(item: WorkItem): string | null {
  if (item.whenIso === null || item.whenIsDay) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

function durationLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} ${hours === 1 ? "hr" : "hrs"}` : `${hours} hr ${remainder} min`;
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
function spokenAmount(item: WorkItem): string | null {
  if (item.amountPaise === null) return null;
  const amount = formatMoney(item.amountPaise);
  return item.amountLabel === null ? amount : `${item.amountLabel.toLowerCase()} ${amount}`;
}

function cardLabel(item: WorkItem): string {
  const facts = [item.accessibleName];
  const amount = spokenAmount(item);
  if (amount !== null) facts.push(amount);
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const duration = durationLabel(item.durationMinutes);
  if (date !== null) facts.push(`date ${date}`);
  if (starts !== null) facts.push(`starts ${starts}`);
  if (duration !== null) facts.push(`duration ${duration}`);
  if (item.areaLabel !== null && item.areaLabel !== item.stateLabel) {
    facts.push(`area ${item.areaLabel}`);
  }
  return facts.join(", ");
}

function ScheduleFacts({ item }: { readonly item: WorkItem }) {
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const duration = durationLabel(item.durationMinutes);
  if (date === null && starts === null && duration === null && item.areaLabel === null) return null;

  return (
    <span className="grid grid-cols-2 gap-x-4 gap-y-2">
      {date === null ? null : (
        <Fact name="date" label="Date">
          {date}
        </Fact>
      )}
      {starts === null ? null : (
        <Fact name="time" label="Starts">
          {starts}
        </Fact>
      )}
      {duration === null ? null : (
        <Fact name="time" label="Duration">
          {duration}
        </Fact>
      )}
      {item.areaLabel === null ? null : (
        <Fact name="distance" label="Area">
          {item.areaLabel}
        </Fact>
      )}
    </span>
  );
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
          : "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-[0_4px_12px_color-mix(in_oklab,var(--color-action-active)_32%,transparent)]",
      )}
    >
      <span className="flex items-center gap-2.75">
        <span className={cn(TILE, lapsed ? "bg-surface-sunken" : "bg-surface")}>
          <Pictogram name="now" size="lg" className="text-text" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-text">
          <CardTitle item={item} />
          <span className="flex items-baseline gap-2">
            <span className="text-[1.875rem] font-extrabold leading-none tracking-[-0.02em]">
              {money(item.amountPaise)}
            </span>
            {item.amountLabel === null ? null : (
              <span className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] opacity-70">
                {item.amountLabel}
              </span>
            )}
          </span>
        </span>

        {countdown && !lapsed ? <CountdownDial countdown={countdown} /> : null}
      </span>

      <span className="text-text">
        <ScheduleFacts item={item} />
      </span>

      <span className={cn(BAR, "bg-surface")}>
        <Pictogram name="yes" size="md" className="text-success-text" />
        <span className="text-base font-bold text-text">Take this job</span>
      </span>
    </Link>
  );
}

/**
 * What the job is, which is the first thing a card has to say.
 *
 * `WorkItem.accessibleName` was built as an `sr-only` string on the rule that
 * this app renders pictures and numbers and never a service name. That rule is
 * what left a Partner looking at `₹450` for a job whose trade was nowhere on
 * screen. It is the card's title now — see the field's own doc comment in
 * `../model/work-item.ts`, which records the change.
 */
function CardTitle({ item }: { item: WorkItem }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-base font-semibold leading-snug">{item.title}</span>
      {item.stateLabel === null ? null : (
        <span className="truncate text-[0.6875rem] font-bold uppercase tracking-[0.04em] opacity-70">
          {item.stateLabel}
        </span>
      )}
    </span>
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
    <span className="grid h-13.5 w-13.5 shrink-0 place-items-center rounded-full bg-text/13">
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
  const at = whenLabel(item);

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(CARD, "border border-line bg-surface")}
    >
      <span className="flex items-center gap-2.75">
        <span className={cn(TILE, "bg-surface-sunken")}>
          <Pictogram name="new" size="lg" className="text-signal-700" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.75">
          <CardTitle item={item} />
          <span className="flex flex-col gap-1 text-text-secondary">
            {item.areaLabel ? (
              <Fact name="distance" label="Near">
                {item.areaLabel}
              </Fact>
            ) : null}
            {at ? (
              <Fact name={item.whenIsDay ? "date" : "time"} label="Requested">
                {at}
              </Fact>
            ) : null}
          </span>
        </span>
      </span>

      <span className={cn(BAR, "bg-action shadow-[0_2px_0_var(--color-action-active)]")}>
        <Pictogram name="go" size="md" className="text-action-text" />
        <span className="text-base font-bold text-action-text">
          {item.actionLabel ?? "Review request"}
        </span>
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
          <Pictogram name="doing" size="lg" className="text-surface" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1 text-text">
          <CardTitle item={item} />
          {item.amountPaise === null ? null : (
            <span className="flex items-baseline gap-2">
              <span className="text-[1.5rem] font-extrabold leading-none tracking-[-0.02em] text-text">
                {money(item.amountPaise)}
              </span>
              {item.amountLabel === null ? null : (
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.04em] text-text-muted">
                  {item.amountLabel}
                </span>
              )}
            </span>
          )}
        </span>
      </span>

      {item.whenIso !== null || item.durationMinutes !== null || item.areaLabel !== null ? (
        <span className="rounded-xl bg-surface-sunken px-3 py-2.5 text-action-secondary">
          <ScheduleFacts item={item} />
        </span>
      ) : null}

      <span
        className={cn(BAR, "bg-action-secondary shadow-[0_2px_0_var(--color-navy-900)]")}
      >
        <Pictogram name="go" size="md" className="text-action-secondary-text" />
        <span className="text-base font-bold text-action-secondary-text">Open this job</span>
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
  const date = dateLabel(item);
  const starts = startTimeLabel(item);

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
        <Pictogram name="done" size="md" className="text-surface" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px text-success-text">
        <span className="truncate text-[0.9375rem] font-semibold leading-snug">
          {item.title}
        </span>
        {date === null ? null : (
          <span className="flex items-center gap-1 truncate text-xs font-semibold opacity-75">
            <Pictogram name="time" size="xs" className="shrink-0" />
            {date}
            {starts === null ? null : ` · ${starts}`}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs font-semibold opacity-75">
          <Pictogram name="held" size="xs" className="shrink-0" />
          Held until payout
        </span>
      </span>
      {item.amountPaise === null ? null : (
        <span className="text-[1.375rem] font-extrabold leading-none tracking-[-0.02em] text-success-text">
          {money(item.amountPaise)}
        </span>
      )}
    </Link>
  );
}

/**
 * You answered; the customer has not.
 *
 * ## Why this is not the settled card
 *
 * It was, briefly, and the result was a green "held until payout" row carrying
 * **`₹ ?`** — announcing that the platform did not know a price, on the one card
 * whose entire subject is a price the vendor had just sent. Two separate
 * untruths: nothing is held, and the amount is not unknown to the vendor.
 *
 * The design's four states are "somebody asked → I answered → I'm doing it → I
 * got paid". This is the second. It gets the calm, neutral treatment a waiting
 * room deserves — no money slot at all, because `EnquirySummary` does not
 * publish the vendor's quoted total and a figure this card cannot source is a
 * figure it must not draw.
 */
function AnsweredCard({ item }: { item: WorkItem }) {
  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-card border border-info-line bg-info-surface px-3.5 py-2.75",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-info-text">
        <Pictogram name="price" size="md" className="text-surface" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px text-info-text">
        <span className="truncate text-[0.9375rem] font-semibold leading-snug">{item.title}</span>
        <span className="truncate text-xs font-semibold opacity-75">
          Waiting for the customer to decide
        </span>
      </span>
      <Pictogram name="go" size="sm" className="shrink-0 text-info-text" />
    </Link>
  );
}

function OutcomeCard({ item }: { item: WorkItem }) {
  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-2.75",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-sunken">
        <Pictogram name="no" size="md" className="text-text-muted" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-[0.9375rem] font-semibold leading-snug text-text">
          {item.title}
        </span>
        <span className="text-xs font-semibold capitalize text-text-muted">
          {item.stateLabel}
        </span>
      </span>
      <Pictogram name="go" size="sm" className="shrink-0 text-text-muted" />
    </Link>
  );
}
