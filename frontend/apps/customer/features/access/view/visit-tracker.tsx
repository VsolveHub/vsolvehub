"use client";

import type { VisitPlanPhase } from "@vsolve/query";
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  RailHeadline,
  RailLayout,
  Skeleton,
  buttonStyles,
  cn,
} from "@vsolve/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatVisitSlot, type VisitSlotRow, type VisitTrackerView } from "../adapters";
import { AccessRefusal } from "./access-refusal";
import { VendorIdentity } from "./vendor-identity";

/**
 * The A5 tracker — `M2-FE-421`, `M2-FE-422`, `M2-FE-424`.
 *
 * One row per **share**, because the shares are the slots the Customer chose and
 * paid for. A slot nobody has taken yet is a row that says so and shows the
 * refund it is owed; driving the list off the visits instead would make exactly
 * that row disappear.
 *
 * ## The money on each row is the server's arithmetic, not ours
 *
 * `M2-FE-424`. Every share publishes `amount_paise`, `vendor_payout_paise` and
 * `platform_share_paise` in integer paise. The row says which of the three the
 * sentence is about and never adds anything up: a client that can produce a
 * number disagreeing with a refund statement eventually will.
 *
 * ## Identity appears per vendor, and only where we actually have it
 *
 * Disclosure starts at slot confirmation, because someone entering a home must
 * be nameable. **The visit read publishes no vendor at all** — `SiteVisit`
 * carries no partner, and the backend's own `VendorCardSerializer` is on no
 * published path — so the only name this app can reach is the one on a
 * delivered estimate. A confirmed slot with no estimate yet says the name is not
 * available rather than showing a placeholder. Logged in
 * `frontend-execution-plan.md` §7.
 */

export interface VisitTrackerProps {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;

  isLoading: boolean;
  readError: unknown;
  onRetryRead: () => void;

  /** Rendered when the server says the plan checkout may be opened. */
  bookVisitsHref: string;
  checkoutAvailable: boolean;

  /** Where the delivered estimates are read. Shown once any visit has completed. */
  estimatesHref: string;

  /**
   * Where one visit's own page lives.
   *
   * The list stopped carrying the visit-day commands when the visit page landed.
   * Arrival, the no-show report and the arrival code all need the context that
   * page has — who is coming, what the money did, what happens next — and a row
   * that offered "they did not come" beside four other rows was a destructive
   * control on a scanning surface.
   */
  visitHref: (visitId: string) => string;

  supportAction?: ReactNode;

  /**
   * The plan-size chooser, when re-choosing is still allowed.
   *
   * A slot rather than a prop set, because the chooser owns its own read, its
   * own command and its own refusal — and it is already built. Absent once a
   * professional has committed to a slot: resizing a plan somebody is already
   * travelling for is not a choice, and `POST .../visit-plan/` says so with a
   * `409`.
   */
  planSwitcher?: ReactNode;
  /** The brief this plan is for, behind a disclosure. Supplied by the caller. */
  brief?: ReactNode;
}

export function VisitTracker({
  phase,
  tracker,
  isLoading,
  readError,
  onRetryRead,
  bookVisitsHref,
  checkoutAvailable,
  estimatesHref,
  visitHref,
  supportAction,
  planSwitcher,
  brief,
}: VisitTrackerProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading your site visits</span>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (readError !== null && readError !== undefined) {
    return (
      <AccessRefusal
        error={readError}
        attempting="see your site visits"
        supportAction={supportAction}
        onRetry={onRetryRead}
        inline={false}
      />
    );
  }

  return (
    <RailLayout
      railLabel="Your visit plan"
      rail={
        <VisitPlanRail
          phase={phase}
          tracker={tracker}
          checkoutAvailable={checkoutAvailable}
          bookVisitsHref={bookVisitsHref}
          planSwitcher={planSwitcher}
          brief={brief}
        />
      }
    >
    <section aria-labelledby="visits-heading" className="rounded-card border border-line bg-surface p-4">
      <h2 id="visits-heading" className="text-lg font-semibold text-text">
        {tracker === null || tracker.planSize <= 1
          ? "Your site visit"
          : `Your ${tracker.planSize} site visits`}
      </h2>

      {/* Three counts before any prose.
          The page used to open with a paragraph about the plan and put a
          paragraph between every row, so working out whether anything needed
          the Customer *today* meant reading all of it. The counts answer that
          in one glance; the paragraph that used to be here is still on the
          screen, folded, at the bottom. */}
      <VisitCounts tracker={tracker} />

      {tracker === null || tracker.rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            compact
            title="No visits yet"
            description="We are inviting professionals who cover this work. Each one that accepts confirms a time here."
          />
        </div>
      ) : (
        <ul className="mt-3 flex list-none flex-col gap-3 p-0">
          {tracker.rows.map((row) => (
            <VisitRow
              key={row.id}
              row={row}
              planSize={tracker.planSize}
              visitHref={visitHref}
            />
          ))}
        </ul>
      )}

      {tracker !== null && tracker.rows.some((row) => row.state === "completed") ? (
        <div className="mt-4">
          <Link href={estimatesHref} className="inline-block">
            <Button variant="outline">Read the estimates</Button>
          </Link>
        </div>
      ) : null}

      {/* Everything the page used to say up front, kept and folded.
          None of it is deleted — a Customer who wants to know why nobody is
          named yet, or what happens to an unfilled slot's money, still has the
          answer on this screen. It is simply no longer in the way of the three
          rows they came to look at. */}
      <Disclosure summary="How these visits work" className="mt-4">
        <PlanStatement phase={phase} tracker={tracker} />
        {tracker !== null && tracker.rows.some((row) => row.vendor === null) ? (
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            We do not show you who has been invited. Once somebody confirms a time
            we tell you their name and show you their photograph, because they are
            coming into your home — their phone number stays with us until you have
            agreed the work.
          </p>
        ) : null}
      </Disclosure>
    </section>
    </RailLayout>
  );
}

/**
 * The plan, the amount, and the one control — beside the visits rather than under them.
 *
 * The mobile design split "your visits" and "pay for visits" across two screens.
 * On a wide screen they belong together, and the reason is the unfilled slot: it
 * sits directly beside the amount, which is exactly the question somebody has
 * when they are asked to pay for two visits and can only see one time. Putting
 * the answer a screen away is how that question becomes a support message.
 *
 * **Nothing here is charged by being rendered.** The checkout opens only when
 * the server says a professional is holding a slot, and the rail says so in the
 * `chosen` phase rather than implying the money is already due.
 */
function VisitPlanRail({
  phase,
  tracker,
  checkoutAvailable,
  bookVisitsHref,
  planSwitcher,
  brief,
}: {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;
  checkoutAvailable: boolean;
  bookVisitsHref: string;
  planSwitcher?: ReactNode;
  brief?: ReactNode;
}) {
  if (tracker === null) return null;

  const held = tracker.rows.find((row) => row.state === "held") ?? null;

  return (
    <div className="flex flex-col gap-3">
      <RailHeadline
        eyebrow={tracker.planSize === 1 ? "1-visit plan" : `${tracker.planSize}-visit plan`}
        value={tracker.priceLabel}
        footnote={
          tracker.planSize === 1
            ? "The visit and the written estimate."
            : `All ${tracker.planSize} visits and their written estimates.`
        }
      />

      {checkoutAvailable ? (
        <div className="flex flex-col gap-2">
          <Link href={bookVisitsHref} className={buttonStyles({ size: "lg", block: true })}>
            Pay {tracker.priceLabel} and lock the visits
          </Link>
          {held !== null ? (
            <p className="text-center text-[0.8125rem] leading-5 text-text-secondary">
              {formatVisitSlot(held.scheduledFor, held.timeZone) ?? "The confirmed slot"} is
              held until you do.
            </p>
          ) : null}
        </div>
      ) : phase === "chosen" ? (
        <p className="rounded-card border border-success-line bg-success-surface p-4 text-sm leading-5 text-text">
          <strong className="font-semibold">Nothing charged yet.</strong> You pay
          once, when the first professional confirms a time.
        </p>
      ) : null}

      {tracker.openSlots > 0 ? (
        <p className="text-sm leading-5 text-text-secondary">
          A visit that never happens refunds its share on its own — you do not
          have to ask.
        </p>
      ) : null}

      <Disclosure summary="What the visit fee covers" hint="Not the project price">
        <p>
          Travel and the professional&rsquo;s time on site, plus a written estimate
          you keep whether or not you hire them. It is not part of the project
          price.
        </p>
      </Disclosure>

      {planSwitcher}
      {brief}
    </div>
  );
}

/**
 * What the plan as a whole is doing, in one paragraph.
 *
 * The `chosen` state is the one worth reading twice: a plan exists and
 * **nothing has been charged**, which is true right up until a professional
 * confirms a time. Saying anything warmer there would be charging the Customer
 * in their imagination.
 */
function PlanStatement({
  phase,
  tracker,
}: {
  phase: VisitPlanPhase;
  tracker: VisitTrackerView | null;
}) {
  const size = tracker?.planSize ?? 0;
  const price = tracker?.priceLabel ?? null;

  switch (phase) {
    case "unpriced":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          We cannot offer site visits for this yet. Nothing has been charged.
        </p>
      );
    case "choosing":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You have not chosen how many professionals should visit. Nothing has
          been charged.
        </p>
      );
    case "chosen":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You asked for {size === 1 ? "one professional" : `${size} professionals`} to
          visit and estimate on site.{" "}
          <strong className="font-semibold text-text">Nothing has been charged.</strong> You
          pay {price ?? "for the plan"} once, when the first one confirms a time.
        </p>
      );
    case "pending":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary" role="status">
          We are confirming your payment for these visits. Your bank or UPI app
          tells us the outcome and that can take a few minutes. Do not pay again —
          this page updates itself.
        </p>
      );
    case "active":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          You paid {price ?? "for the plan"} for {size === 1 ? "one visit" : `${size} visits`}.
          Any slot nobody fills refunds its share of that on its own — you do not
          have to ask.
        </p>
      );
    case "failed":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          The payment for these visits did not go through, so you have not been
          charged and the slot that was being held has gone back.
        </p>
      );
    case "void":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          This request closed before any professional confirmed a visit. Nothing
          was charged.
        </p>
      );
    case "settled":
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          Every visit on this plan is settled — paid to the professional who came,
          or refunded to you.
        </p>
      );
    default:
      return (
        <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
          We cannot describe where these visits stand right now.
        </p>
      );
  }
}

const SLOT_BADGE: Record<VisitSlotRow["state"], { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  awaiting: { label: "Waiting for a professional", tone: "neutral" },
  // Held, not scheduled. The vendor has committed to a time and the Customer has
  // not bought it yet — showing this as confirmed would promise both of them
  // something nobody has paid for.
  held: { label: "Holding a time for you", tone: "warning" },
  scheduled: { label: "Confirmed", tone: "success" },
  in_progress: { label: "On site", tone: "info" },
  completed: { label: "Visited", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  vendor_no_show: { label: "They did not come", tone: "danger" },
  customer_no_show: { label: "Nobody was on site", tone: "warning" },
};

/**
 * The three counts that open the list.
 *
 * Derived here rather than published, because each one is a question about
 * *rows* — "is anything happening today" — and the server publishes a plan.
 * `openSlots` is the tracker's own; the other two are read off the row states.
 *
 * Renders nothing when there is nothing to count. A strip of zeroes above an
 * empty state is a summary of an absence.
 */
function VisitCounts({ tracker }: { tracker: VisitTrackerView | null }) {
  if (tracker === null || tracker.rows.length === 0) return null;

  const today = tracker.rows.filter((row) => isToday(row.scheduledFor, row.timeZone)).length;
  const upcoming = tracker.rows.filter(
    (row) =>
      (row.state === "scheduled" || row.state === "held") &&
      !isToday(row.scheduledFor, row.timeZone),
  ).length;

  return (
    <dl className="mt-3 grid grid-cols-3 divide-x divide-line overflow-hidden rounded-control border border-line">
      <VisitCount label="Today" value={today} emphasise={today > 0} />
      <VisitCount label="Upcoming" value={upcoming} />
      <VisitCount label="Open slots" value={tracker.openSlots} />
    </dl>
  );
}

function VisitCount({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: number;
  emphasise?: boolean;
}) {
  return (
    <div className="px-2 py-2 text-center">
      <dd
        className={cn(
          "text-xl font-semibold tabular-nums",
          emphasise ? "text-action-active" : "text-text",
        )}
      >
        {value}
      </dd>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
    </div>
  );
}

/**
 * Whether a visit falls on the reader's today, in the visit's own zone.
 *
 * The zone matters more than it looks: a 9pm visit in one area is already
 * tomorrow in another, and "Today" is the one label on this screen somebody
 * acts on immediately. Compared as formatted date strings in that zone rather
 * than by arithmetic on instants, so the comparison is the same one the row's
 * own label is rendered from.
 */
function isToday(scheduledFor: string | null, timeZone: string | null): boolean {
  if (scheduledFor === null) return false;
  const when = new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) return false;
  const zone = timeZone ?? undefined;
  try {
    const format = (value: Date) => value.toLocaleDateString("en-IN", { timeZone: zone });
    return format(when) === format(new Date());
  } catch {
    // An unknown IANA zone from a future service area must not take the list
    // down over a badge. Not-today is the quiet answer.
    return false;
  }
}

/**
 * One slot, as a card you scan rather than a paragraph you read.
 *
 * The row used to carry the vendor sentence, the money sentence, the estimate
 * deadline sentence and up to two destructive controls — four blocks of prose
 * per row, three rows deep. All of it still exists; it moved to the visit's own
 * page, which is linked from here and is where somebody who has picked a row
 * actually wants to be.
 *
 * What stays is what a scanning reader needs to choose between rows: who,
 * when, how much, and what state it is in.
 */
function VisitRow({
  row,
  planSize,
  visitHref,
}: {
  row: VisitSlotRow;
  planSize: number;
  visitHref: (visitId: string) => string;
}) {
  const badge = SLOT_BADGE[row.state] ?? SLOT_BADGE.awaiting;
  // The visit's own zone since 1.26.0, not the deprecated single-city constant.
  const when = formatVisitSlot(row.scheduledFor, row.timeZone);
  const today = isToday(row.scheduledFor, row.timeZone);

  return (
    <li
      className={cn(
        "rounded-card border p-3",
        // Today's visit is the one row that might need somebody in the next hour,
        // so it is the one row drawn differently. Emphasis is the palette's own
        // action tint rather than a second colour.
        today ? "border-action-line bg-action-surface" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {row.vendor !== null ? (
          <VendorIdentity vendor={row.vendor} />
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {row.state === "awaiting"
                ? "Nobody has taken this slot yet"
                : "We will name them before they arrive"}
            </p>
            <p className="text-sm text-text-secondary">
              Visit {row.position} of {planSize}
            </p>
          </div>
        )}
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-control bg-surface-sunken px-3 py-2">
        <span className="text-sm font-medium text-text">{when ?? "No time yet"}</span>
        {/* One clause, not the paragraph the row used to carry. The full
            sentence about what this money is doing is on the visit page. */}
        <span className="text-sm tabular-nums text-text-secondary">
          {row.money.amountLabel} {MONEY_CLAUSE[row.money.kind]}
        </span>
      </div>

      {row.visitId !== null ? (
        <div className="mt-3">
          <Link
            href={visitHref(row.visitId)}
            className={buttonStyles({
              variant: today ? "primary" : "outline",
              size: "sm",
            })}
          >
            {today ? "Open today's visit" : "Open visit"}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The money, in three words rather than three lines.
 *
 * Every clause is the short form of the sentence `SlotMoneyLine` still renders
 * in full on the visit page. The list says which of the five things happened;
 * the page says what it means.
 */
const MONEY_CLAUSE: Record<VisitSlotRow["money"]["kind"], string> = {
  unspent: "set aside",
  committed: "covering this visit",
  earned: "paid out",
  refunded: "refunded",
  replaced: "held for a free replacement",
};
