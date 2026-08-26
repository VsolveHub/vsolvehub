"use client";

import { useServerCountdown, type Countdown } from "@vsolve/query";
import { cn, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";

import type { WorkItem } from "../model/work-item";

/**
 * One card per `WorkItem` — the six states of the Partner's timeline.
 *
 * ## The change this file makes
 *
 * The cards it replaces gave every state the same weight: a live offer with 90
 * seconds on the clock and a job settled three weeks ago were both full-width,
 * multi-row cards with a 56px action bar. On a working account the screen was
 * therefore a uniform wall, and the one card with a clock on it had to compete
 * for attention with forty that did not.
 *
 * These split into two shapes, by whose move it is:
 *
 * - **`HotCard`** — `live`, `needs_price`, `doing`. Something is waiting on this
 *   Partner. Full card, the money at figure size, a full-width action bar.
 * - **`QuietRow`** — `answered`, `settled`, `not_chosen`, `closed`. A record,
 *   not a task. A 60px row: glyph, title, one supporting line, amount.
 *
 * That is the same hierarchy an Uber or Rapido driver screen uses, and for the
 * same reason. The stack's own comparator already sorts urgency first, so the
 * shapes only draw a boundary the ordering already implies.
 *
 * ## What is *not* changed
 *
 * Every value shown still comes from `WorkItem` and nothing is derived,
 * defaulted or filled in. In particular:
 *
 * - `money()` still prints "₹ ?" for an unpriced item rather than a zero.
 * - An engagement's figure is still labelled with `amountLabel` ("agreed"),
 *   never presented as a payout — `WorkItem.amountPaise` documents at length why
 *   that distinction cannot be flattened.
 * - `AnsweredCard` still carries no money slot at all, because `EnquirySummary`
 *   does not publish the vendor's quoted total.
 */

export function WorkCard({ item, index = 0 }: { item: WorkItem; index?: number }) {
  switch (item.urgency) {
    case "live":
      return <LiveOfferCard item={item} index={index} />;
    case "needs_price":
      return <NeedsPriceCard item={item} index={index} />;
    case "doing":
      return <DoingCard item={item} index={index} />;
    case "settled":
      return <SettledRow item={item} index={index} />;
    case "answered":
      return <AnsweredRow item={item} index={index} />;
    case "not_chosen":
    case "closed":
      return <OutcomeRow item={item} index={index} />;
  }
}

/* --------------------------------------------------------------------------
   Shared chrome
   -------------------------------------------------------------------------- */

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/** Every card is a tap target first. */
const CARD = cn(
  "pv-tap pv-press pv-row-in flex flex-col gap-3 rounded-card p-3.5",
  FOCUS,
);

/** A record row. 60px minimum, which is a comfortable thumb target. */
const ROW = cn(
  "pv-tap pv-press pv-row-in flex min-h-15 items-center gap-3 rounded-card border px-3.5 py-2.5",
  FOCUS,
);

const TILE = "grid h-13 w-13 shrink-0 place-items-center rounded-tile";
const ROW_TILE = "grid h-10 w-10 shrink-0 place-items-center rounded-tile";
const BAR = "flex h-13 items-center justify-center gap-2 rounded-control";

/** Staggers a list without any per-item state. See `.pv-row-in`. */
function stagger(index: number) {
  // Capped: past the eighth row the delay is longer than anyone waits, and a
  // long list would animate its tail in after the reader has already scrolled
  // past it.
  return { "--pv-i": Math.min(index, 8) } as React.CSSProperties;
}

/* --------------------------------------------------------------------------
   Value formatting — unchanged behaviour, gathered in one place
   -------------------------------------------------------------------------- */

/** The headline number, or "₹ ?" for something not yet priced. */
function money(amountPaise: number | null): string {
  return amountPaise === null ? "₹ ?" : formatMoney(amountPaise);
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

/**
 * A clock, but only where one was actually chosen.
 *
 * An enquiry's `requested_start` is a **day** the customer picked, published as
 * a `date-time` at midnight — formatting it as a clock printed "12:00 am" on
 * every enquiry in the stack. `WorkItem.whenIsDay` is what decides, rather than
 * sniffing the value, because midnight is also a legitimate scheduled time and
 * guessing would mis-render the one job that really does start then.
 */
function startTimeLabel(item: WorkItem): string | null {
  if (item.whenIso === null || item.whenIsDay) return null;
  const at = new Date(item.whenIso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(at);
}

function durationLabel(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} ${hours === 1 ? "hr" : "hrs"}` : `${hours} hr ${remainder} min`;
}

function spokenAmount(item: WorkItem): string | null {
  if (item.amountPaise === null) return null;
  const amount = formatMoney(item.amountPaise);
  return item.amountLabel === null ? amount : `${item.amountLabel.toLowerCase()} ${amount}`;
}

/**
 * The card's accessible name.
 *
 * Composed rather than authored, so a screen reader hears one sentence instead
 * of walking a nest of spans, and so the title and its state can never drift
 * apart.
 */
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

/* --------------------------------------------------------------------------
   Card parts
   -------------------------------------------------------------------------- */

function CardTitle({ item, tone = "ink" }: { item: WorkItem; tone?: "ink" | "inherit" }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={cn("truncate text-title leading-snug", tone === "ink" && "text-text")}>
        {item.title}
      </span>
      {item.stateLabel === null ? null : (
        <span className="truncate text-micro uppercase opacity-70">{item.stateLabel}</span>
      )}
    </span>
  );
}

/**
 * A picture and a value, at card-fact size.
 *
 * Where the glyph alone is ambiguous — `time` reads as both "starts at" and
 * "how long" — the caller passes a `label`, which renders above the value.
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
    <span className="flex min-w-0 items-center gap-1.5">
      <Pictogram name={name} size="sm" className="shrink-0 opacity-70" />
      <span className="flex min-w-0 flex-col leading-tight">
        {label === undefined ? null : (
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.04em] opacity-65">
            {label}
          </span>
        )}
        <span className="truncate text-caption font-bold">{children}</span>
      </span>
    </span>
  );
}

/** The two-by-two grid of schedule facts a scheduled card carries. */
function ScheduleFacts({ item }: { item: WorkItem }) {
  const date = dateLabel(item);
  const starts = startTimeLabel(item);
  const duration = durationLabel(item.durationMinutes);
  if (date === null && starts === null && duration === null && item.areaLabel === null) return null;

  return (
    <span className="grid grid-cols-2 gap-x-3 gap-y-2">
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
 * `mm:ss`, and how alarmed to be about it.
 *
 * The urgency tint is derived purely from `remainingMs` — under a minute is
 * red, under two is amber, above that neutral. Deliberately **not** a progress
 * arc: an arc needs a window length to be a fraction of, and no endpoint
 * publishes the offer window, so the denominator would have to be invented.
 * Time remaining is measured; the fraction of a window would not be.
 *
 * The digits are `aria-hidden` and the coarse `announce` string is read
 * instead — a per-second reading of a ticking clock is unusable with a screen
 * reader.
 */
function CountdownDial({ countdown }: { countdown: Countdown }) {
  const critical = countdown.remainingMs < 60_000;
  const soon = countdown.remainingMs < 120_000;

  return (
    <span
      className={cn(
        "grid h-13 w-13 shrink-0 place-items-center rounded-pill border-2",
        critical
          ? "border-danger-text bg-surface text-danger-text"
          : soon
            ? "border-warning-text bg-surface text-warning-text"
            : "border-text/20 bg-text/10 text-text",
      )}
    >
      <span aria-hidden className="pv-num text-caption font-extrabold tracking-[-0.02em]">
        {countdown.display}
      </span>
      <span className="sr-only">{countdown.announce}</span>
    </span>
  );
}

/* --------------------------------------------------------------------------
   Hot cards — something is waiting on this Partner
   -------------------------------------------------------------------------- */

/**
 * A clock is running on this one — the hottest card on any screen.
 *
 * Both offer sources land here on purpose: an A3 crew offer and an A1 direct
 * offer are different records on different endpoints, but to a Partner they are
 * the same thing — somebody is offering work and there is a deadline on the
 * answer. `href` is what separates them.
 *
 * ## The lapse guard
 *
 * `toWorkItems` filters A3 offers against the server's own `server_now` but
 * applies no equivalent clock to A1 offers, because Celery owns those deadlines
 * and `status` is the truth. So an A1 offer whose deadline has passed but whose
 * next five-second poll has not landed sorts to the very top of the stack. A
 * lapsed card therefore drops the heat and the countdown rather than shouting.
 * It is not removed: the server decides what is expired, this only decides what
 * to shout about.
 */
function LiveOfferCard({ item, index }: { item: WorkItem; index: number }) {
  const countdown = useServerCountdown(item.respondsBy, 1000);
  const lapsed = countdown?.isExpired ?? false;

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      style={stagger(index)}
      className={cn(
        CARD,
        lapsed
          ? "border border-line bg-surface"
          : "bg-[linear-gradient(135deg,var(--color-signal-400)_0%,var(--color-action)_55%,var(--color-action-active)_100%)] shadow-hot",
      )}
    >
      <span className="flex items-center gap-3">
        <span className={cn(TILE, lapsed ? "bg-surface-sunken" : "bg-surface")}>
          <Pictogram name="now" size="lg" className="text-text" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1 text-text">
          <CardTitle item={item} tone="inherit" />
          <span className="flex items-baseline gap-2">
            <span className="pv-num text-figure">{money(item.amountPaise)}</span>
            {item.amountLabel === null ? null : (
              <span className="text-micro uppercase opacity-70">{item.amountLabel}</span>
            )}
          </span>
        </span>

        {countdown && !lapsed ? <CountdownDial countdown={countdown} /> : null}
      </span>

      <span className="text-text">
        <ScheduleFacts item={item} />
      </span>

      <span className={cn(BAR, "bg-surface shadow-[0_2px_0_rgb(0_17_46/0.12)]")}>
        <Pictogram name="yes" size="md" className="text-success-text" />
        <span className="text-title text-text">Take this job</span>
      </span>
    </Link>
  );
}

/**
 * Waiting on a price from this Partner.
 *
 * Plain surface with the orange action bar: the work here is a decision the
 * Partner makes at their own pace, not a race. A gradient would put it in
 * competition with the one card that genuinely has a clock.
 */
function NeedsPriceCard({ item, index }: { item: WorkItem; index: number }) {
  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      style={stagger(index)}
      className={cn(CARD, "border border-line bg-surface shadow-card")}
    >
      <span className="flex items-center gap-3">
        <span className={cn(TILE, "bg-action-surface")}>
          <Pictogram name="new" size="lg" className="text-signal-700" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <CardTitle item={item} />
          <span className="text-text-secondary">
            <ScheduleFacts item={item} />
          </span>
        </span>
      </span>

      <span className={cn(BAR, "bg-action shadow-[0_2px_0_var(--color-action-active)]")}>
        <Pictogram name="price" size="md" className="text-action-text" />
        <span className="text-title text-action-text">{item.actionLabel ?? "Send your price"}</span>
      </span>
    </Link>
  );
}

/**
 * Being done now — the navy spine.
 *
 * A job leads with its start time and an engagement with its money, because an
 * engagement publishes no schedule of its own: its stages carry `scheduled_on`
 * and the agreement does not, so `whenIso` is null for every one of them.
 */
function DoingCard({ item, index }: { item: WorkItem; index: number }) {
  const hasFacts =
    item.whenIso !== null || item.durationMinutes !== null || item.areaLabel !== null;

  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      style={stagger(index)}
      className={cn(
        CARD,
        "border border-line border-l-[5px] border-l-action-secondary bg-surface shadow-card",
      )}
    >
      <span className="flex items-center gap-3">
        <span
          className={cn(
            TILE,
            "bg-[linear-gradient(150deg,var(--color-navy-300),var(--color-navy-500))]",
          )}
        >
          <Pictogram name="doing" size="lg" className="text-surface" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <CardTitle item={item} />
          {item.amountPaise === null ? null : (
            <span className="flex items-baseline gap-2">
              <span className="pv-num text-figure text-text">{money(item.amountPaise)}</span>
              {item.amountLabel === null ? null : (
                <span className="text-micro uppercase text-text-muted">{item.amountLabel}</span>
              )}
            </span>
          )}
        </span>
      </span>

      {hasFacts ? (
        <span className="rounded-control bg-surface-sunken px-3 py-2.5 text-action-secondary">
          <ScheduleFacts item={item} />
        </span>
      ) : null}

      <span className={cn(BAR, "bg-action-secondary shadow-[0_2px_0_var(--color-navy-900)]")}>
        <Pictogram name="go" size="md" className="text-action-secondary-text" />
        <span className="text-title text-action-secondary-text">Open this job</span>
      </span>
    </Link>
  );
}

/* --------------------------------------------------------------------------
   Quiet rows — records, not tasks
   -------------------------------------------------------------------------- */

function QuietRow({
  item,
  index,
  skin,
  tile,
  glyph,
  detail,
  amount,
}: {
  item: WorkItem;
  index: number;
  skin: string;
  tile: string;
  glyph: PictogramName;
  detail: ReactNode;
  amount?: ReactNode;
}) {
  return (
    <Link
      href={item.href}
      aria-label={cardLabel(item)}
      style={stagger(index)}
      className={cn(ROW, skin)}
    >
      <span className={cn(ROW_TILE, tile)}>
        <Pictogram name={glyph} size="md" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-bold leading-snug">{item.title}</span>
        <span className="flex min-w-0 items-center gap-1 truncate text-caption font-semibold opacity-75">
          {detail}
        </span>
      </span>
      {amount ?? <Pictogram name="go" size="sm" className="shrink-0 opacity-60" />}
    </Link>
  );
}

/**
 * Settled — the money is earned and held until the payout run.
 *
 * Only a completed A1 visit reaches this state. An engagement is never mapped
 * to `settled` by the adapter, which is what keeps the "you got paid" treatment
 * off the one figure that is not a payout.
 */
function SettledRow({ item, index }: { item: WorkItem; index: number }) {
  const date = dateLabel(item);

  return (
    <QuietRow
      item={item}
      index={index}
      skin="border-success-line bg-success-surface text-success-text"
      tile="bg-success-text text-surface"
      glyph="done"
      detail={
        <>
          <Pictogram name="held" size="xs" className="shrink-0" />
          {date === null ? "Held until payout" : `${date} · held until payout`}
        </>
      }
      amount={
        item.amountPaise === null ? undefined : (
          <span className="pv-num shrink-0 text-title font-extrabold tracking-[-0.02em]">
            {money(item.amountPaise)}
          </span>
        )
      }
    />
  );
}

/**
 * You answered; the customer has not.
 *
 * No money slot at all, and that is load-bearing. This state was briefly given
 * the settled card, which produced a green "held until payout" row carrying
 * **`₹ ?`** — two untruths on the one card whose whole subject is a price the
 * vendor had just sent. `EnquirySummary` does not publish the vendor's quoted
 * total, so this card cannot source a figure and must not draw one.
 */
function AnsweredRow({ item, index }: { item: WorkItem; index: number }) {
  return (
    <QuietRow
      item={item}
      index={index}
      skin="border-info-line bg-info-surface text-info-text"
      tile="bg-info-text text-surface"
      glyph="price"
      detail="Waiting for the customer to decide"
    />
  );
}

/** Not chosen, or closed. The quietest thing on the screen. */
function OutcomeRow({ item, index }: { item: WorkItem; index: number }) {
  return (
    <QuietRow
      item={item}
      index={index}
      skin="border-line bg-surface text-text"
      tile="bg-surface-sunken text-text-muted"
      glyph="no"
      detail={<span className="capitalize text-text-muted">{item.stateLabel}</span>}
    />
  );
}
