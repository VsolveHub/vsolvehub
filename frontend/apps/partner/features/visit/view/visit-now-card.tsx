"use client";

import { Badge, Card, ErrorState, FactTile, Readout, Spinner, formatMoney } from "@vsolve/ui";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { timeAgo } from "@/lib/format";

import { timeOnlyInZone } from "../model/visit-clock";
import type { SiteVisitStatus } from "../model/visit-state";
import type { VisitDayControls } from "./use-visit-day";

/**
 * The "now" card: where this visit stands, and nothing else.
 *
 * The first block under the header on `/work/enquiries/[id]`, and the only one
 * whose contents change with the visit's state. Everything below it — the
 * address, the customer, the brief — is in the same place on every state, which
 * is what lets a vendor learn the screen once.
 *
 * ## What moved out of here
 *
 * This used to be the whole screen's worth of visit UI: the status, the facts,
 * the customer rung, and all four commands stacked at the bottom of a card that
 * was itself the third thing on the page. A vendor standing at a gate had to
 * scroll past a paragraph and an address to reach "I've arrived".
 *
 * The commands are now `VisitActionBar`, pinned to the bottom of the viewport;
 * the customer rung is the screen's own contact card; and the arrival code has a
 * route to itself (`ArrivalScreen`) because reading six digits back to somebody
 * standing in front of you deserves more than a box wedged between two cards. What is left is the
 * answer to one question — *what is happening with this visit right now* — with
 * the time reported the way a vendor thinks about it ("Tomorrow, 8:00 am,
 * starts in 16h 12m") rather than as an ISO instant printed twice.
 */

export interface VisitNowCardProps {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
  /** The server says this invitation already has a submitted estimate. */
  readonly estimateSubmitted?: boolean;
  /** True while a held visit is re-reading to see whether payment cleared. */
  readonly isRefreshing?: boolean;
}

export function VisitNowCard({
  controls,
  enquiry,
  estimateSubmitted = false,
  isRefreshing = false,
}: VisitNowCardProps) {
  const { visit, status, timing } = controls;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-text">Your visit</h2>
        <Badge tone={TONE[status.tone]} dot>
          {status.label}
        </Badge>
      </div>

      <VisitProgress status={visit.status} />

      {visit.status === "REQUESTED" ? (
        <HeldVisit
          approximateArea={enquiry.approximateArea}
          isRefreshing={isRefreshing}
        />
      ) : null}

      {/* SCHEDULED: the whole card is the clock. */}
      {visit.status === "SCHEDULED" && timing ? (
        <>
          <WhenBlock
            headline={`${timing.dayLabel}, ${timing.timeLabel}`}
            detail={[timing.fullLabel, timing.durationLabel].filter(Boolean).join(" · ")}
            note={timing.relative}
            tone={timing.isVisitDay ? "action" : "neutral"}
          />

          {timing.leaveBy ? (
            <p className="flex items-start gap-2 text-sm leading-5 text-text-secondary">
              <span aria-hidden className="mt-px shrink-0 text-text-muted">
                <Pictogram name="later" size="sm" />
              </span>
              {/* A reminder derived from the slot, never a travel estimate:
                  Vsolve knows where the site is and nothing about where this
                  vendor is starting from. */}
              <span>
                Set off by <span className="font-bold text-text">{timing.leaveBy}</span> to be
                there on time.
              </span>
            </p>
          ) : null}

          {controls.canStartArrival ? null : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface-sunken px-3 py-2.5">
              <p className="text-xs leading-5 text-text-secondary">
                &ldquo;I&rsquo;ve arrived&rdquo; opens on the day of the visit.
              </p>
              {/* Dev builds only — `overrideArrivalGate` is null in production,
                  so this control does not exist there. It is labelled rather
                  than hidden: a screen that quietly behaves differently in dev
                  is a screen nobody can trust when it behaves differently in
                  production. */}
              {controls.overrideArrivalGate === null ? null : (
                <button
                  type="button"
                  onClick={controls.overrideArrivalGate}
                  className="shrink-0 rounded-control border border-dashed border-line px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Open anyway · dev
                </button>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* On site: the elapsed clock, and what finishing costs. */}
      {visit.status === "IN_PROGRESS" ? (
        <>
          <WhenBlock
            headline={
              visit.arrival_confirmed_at
                ? `On site since ${timeOnlyInZone(visit.arrival_confirmed_at, visit.timezone)}`
                : "On site"
            }
            detail={timing?.durationLabel ?? null}
            note={null}
            tone="action"
          />
          <p className="text-sm leading-5 text-text-secondary">
            When you finish, the estimate timer starts.
          </p>
        </>
      ) : null}

      {visit.status === "COMPLETED" ? (
        <CompletedVisit
          controls={controls}
          enquiry={enquiry}
          estimateSubmitted={estimateSubmitted}
        />
      ) : null}

      {timing?.zoneUnsupported ? (
        <p className="text-xs leading-5 text-text-muted">
          Check this time against the site&rsquo;s timezone ({visit.timezone}).
        </p>
      ) : null}

      {visit.cancellation_reason_code ? (
        <p className="text-sm leading-6 text-text-secondary">
          Recorded reason: {visit.cancellation_reason_code.replace(/[_-]+/g, " ")}
        </p>
      ) : null}

      {controls.failure ? (
        <ErrorState
          inline
          title={controls.failure.title}
          message={controls.failure.message}
          severity={controls.failure.severity}
          actionLabel="Try again"
          onAction={controls.resetFailure}
          reference={controls.failure.reference}
        />
      ) : null}

    </Card>
  );
}

/* --------------------------------------------------------------------------
   Pieces
   -------------------------------------------------------------------------- */

const TONE = {
  action: "action",
  progress: "info",
  settled: "neutral",
  gone: "neutral",
} as const;

/**
 * The single biggest thing on the card.
 *
 * One instant, said once, in the order a vendor asks for it: which day, what
 * time, then the detail. The old row printed the date twice on one line and led
 * with the word "When", which is the question rather than the answer.
 */
function WhenBlock({
  headline,
  detail,
  note,
  tone,
}: {
  readonly headline: string;
  readonly detail: string | null;
  readonly note: string | null;
  readonly tone: "action" | "neutral";
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-card border px-4 py-4 text-center ${
        tone === "action"
          ? "border-action-line bg-action-surface"
          : "border-line bg-surface-sunken"
      }`}
    >
      <p className="text-xl font-extrabold tracking-[-0.02em] text-text">{headline}</p>
      {detail === null || detail === "" ? null : (
        <p className="text-sm font-semibold text-text-secondary">{detail}</p>
      )}
      {note === null ? null : (
        <p className="text-sm font-bold text-action-secondary">{note}</p>
      )}
    </div>
  );
}

/**
 * A closed visit with an estimate still owed.
 *
 * The money finally appears here, because here it is a fact rather than a
 * forecast: the visit is done, and the visit share is earned on this visit plus
 * a usable estimate inside the window. The countdown is the loudest thing —
 * a completed visit that produces no estimate pays nothing and is refunded.
 */
function CompletedVisit({
  controls,
  enquiry,
  estimateSubmitted,
}: {
  readonly controls: VisitDayControls;
  readonly enquiry: EnquiryRecord;
  readonly estimateSubmitted: boolean;
}) {
  const { visit, estimateCountdown } = controls;

  return (
    <div className="flex flex-col gap-3">
      {/* The countdown is the deadline for *sending*. Once it is sent the
          deadline is met, and leaving a warning-toned timer running over a
          submitted estimate reads as a demand for something already done. */}
      {estimateSubmitted ? (
        <p className="text-sm font-semibold leading-5 text-success-text">
          Estimate submitted. The customer can review it now.
        </p>
      ) : visit.estimate_due_at && estimateCountdown ? (
        <Readout
          label="Estimate due in"
          value={estimateCountdown.isExpired ? "Past due" : estimateCountdown.display}
          announce={
            estimateCountdown.isExpired
              ? "The estimate window has passed"
              : estimateCountdown.announce
          }
          tone={estimateCountdown.isExpired ? "danger" : "warning"}
          size="sm"
          caption={`Due ${timeAgo(visit.estimate_due_at)}`}
        />
      ) : null}

      <p className="text-sm leading-5 text-text-secondary">
        {visit.completed_at ? `Visit closed ${timeAgo(visit.completed_at)}. ` : ""}
        {estimateSubmitted
          ? "You can revise it while the enquiry remains open."
          : "Send the estimate before the timer ends — it is what the customer paid for."}
      </p>

      {enquiry.fixedVisitEarningPaise === null ? null : (
        <p className="text-sm font-semibold text-text">
          {formatMoney(enquiry.fixedVisitEarningPaise)} visit fee earned
        </p>
      )}
    </div>
  );
}

/**
 * The gap between accepting a visit and being able to travel to it.
 *
 * Accepting does not book. The slot is held while the customer pays, and only
 * a verified payment turns a hold into a booking — so there is a window,
 * minutes long, where the partner has won the visit and must not set off. The
 * warning is the loudest thing here, above the facts and before the money.
 *
 * The locked rows are the point, not decoration: the exact address and the
 * customer's phone both exist on the server right now and are deliberately
 * withheld until payment confirms. Rendering them locked says two true things
 * at once — there is an address, and you cannot have it yet. No release
 * control: no such mutation is published.
 *
 * The visit fee is not repeated here. The header carries it on every state of a
 * visit that exists, which is the whole reason it was moved there.
 */
function HeldVisit({
  approximateArea,
  isRefreshing,
}: {
  readonly approximateArea: string;
  readonly isRefreshing: boolean;
}) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-success-surface text-success-text"
        >
          <Pictogram name="yes" size="lg" />
        </span>
        <p className="text-lg font-extrabold tracking-[-0.02em] text-text">This visit is yours</p>
      </div>

      <div className="flex gap-3 rounded-card border-[1.5px] border-warning-line bg-warning-surface p-3.5">
        <span aria-hidden className="mt-px shrink-0 text-warning-text">
          <Pictogram name="later" size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold tracking-[-0.015em] text-warning-text">
            Do not travel yet
          </p>
          <p className="mt-1 text-[12.5px] leading-[18px] text-warning-text">
            Waiting for customer payment. This page updates automatically.
          </p>
        </div>
        {isRefreshing ? <Spinner size="sm" /> : null}
      </div>

      <div className="flex flex-col gap-2">
        <FactTile
          locked
          icon={<Pictogram name="site" size="sm" />}
          label="Exact address"
          value={
            approximateArea.trim() === "" ? "After payment" : `${approximateArea} — after payment`
          }
        />
        <FactTile
          locked
          icon={<Pictogram name="call" size="sm" />}
          label="Customer phone"
          value="After payment"
        />
      </div>

    </div>
  );
}

const PROGRESS_STEPS: readonly {
  readonly label: string;
  readonly icon: PictogramName;
}[] = [
  { label: "Visit", icon: "date" },
  { label: "On site", icon: "site" },
  { label: "Estimate", icon: "price" },
];

export function VisitProgress({ status }: { readonly status: SiteVisitStatus }) {
  if (status === "CANCELLED" || status === "VENDOR_NO_SHOW" || status === "CUSTOMER_NO_SHOW") {
    return null;
  }

  const current = status === "COMPLETED" ? 2 : status === "IN_PROGRESS" ? 1 : 0;

  return (
    <ol aria-label="Visit progress" className="grid grid-cols-3 gap-2">
      {PROGRESS_STEPS.map((step, index) => {
        const complete = index < current;
        const active = index === current;
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
          >
            <span
              className={`grid h-11 w-11 place-items-center rounded-2xl border ${
                complete
                  ? "border-success-line bg-success-surface text-success-text"
                  : active
                    ? "border-action-line bg-action-surface text-action-secondary"
                    : "border-line bg-surface-sunken text-text-muted"
              }`}
            >
              <Pictogram name={complete ? "done" : step.icon} size="md" />
            </span>
            <span
              className={`truncate text-xs font-bold ${active ? "text-text" : "text-text-muted"}`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
