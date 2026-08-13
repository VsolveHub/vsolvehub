"use client";

import type { VisitPlanPhase } from "@vsolve/query";
import { Badge, Button, ConfirmAction, EmptyState, Skeleton } from "@vsolve/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { formatVisitSlot, type VisitSlotRow, type VisitTrackerView } from "../adapters";
import { AccessRefusal } from "./access-refusal";

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

  onConfirmArrival: (visitId: string) => void;
  onReportNoShow: (visitId: string) => void;
  isCommandPending: boolean;
  commandError: unknown;

  supportAction?: ReactNode;
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
  onConfirmArrival,
  onReportNoShow,
  isCommandPending,
  commandError,
  supportAction,
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
    <section aria-labelledby="visits-heading" className="rounded-card border border-line bg-surface p-4">
      <h2 id="visits-heading" className="text-lg font-semibold text-text">
        Site visits
      </h2>

      <PlanStatement phase={phase} tracker={tracker} />

      {/* The disclosure ladder, said out loud on the screen it applies to. A
          Customer wondering why there are no names yet should not have to guess
          whether it is a policy or a bug — and the sentence is also what makes
          the name appearing later read as a deliberate release rather than a
          leak. */}
      {tracker !== null && tracker.rows.some((row) => row.vendorName === null) ? (
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          We do not show you who has been invited. Once somebody confirms a time
          we tell you their name, because they are coming into your home — their
          phone number stays with us until you have agreed the work.
        </p>
      ) : null}

      {checkoutAvailable ? (
        <div className="mt-3 rounded-card border border-action-line bg-action-surface p-3">
          <p className="font-medium text-text">A professional has confirmed a time</p>
          <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
            They are holding that slot while you pay for the plan. If you do not,
            the hold simply lapses and nothing is charged.
          </p>
          <div className="mt-3">
            <Link href={bookVisitsHref} className="inline-block">
              <Button>Book your visits</Button>
            </Link>
          </div>
        </div>
      ) : null}

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
              onConfirmArrival={onConfirmArrival}
              onReportNoShow={onReportNoShow}
              isCommandPending={isCommandPending}
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

      <div className="mt-3">
        <AccessRefusal
          error={commandError}
          attempting="update this visit"
          supportAction={supportAction}
        />
      </div>
    </section>
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

function VisitRow({
  row,
  planSize,
  onConfirmArrival,
  onReportNoShow,
  isCommandPending,
}: {
  row: VisitSlotRow;
  planSize: number;
  onConfirmArrival: (visitId: string) => void;
  onReportNoShow: (visitId: string) => void;
  isCommandPending: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const badge = SLOT_BADGE[row.state] ?? SLOT_BADGE.awaiting;
  const when = formatVisitSlot(row.scheduledFor);

  return (
    <li className="rounded-card border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-secondary">
            Visit {row.position} of {planSize}
          </p>
          <p className="mt-0.5 font-medium text-text">{when ?? "No time yet"}</p>
          <VendorLine row={row} />
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <SlotMoneyLine row={row} />

      {row.state === "completed" && row.estimateDueAt !== null ? (
        <p className="mt-2 text-sm text-text-secondary">
          Their written estimate is due by {formatVisitSlot(row.estimateDueAt)}. If
          it does not arrive, this visit refunds its share or we send somebody
          else, free.
        </p>
      ) : null}

      {row.canConfirmArrival || row.canReportNoShow ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {row.canConfirmArrival && row.visitId !== null ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onConfirmArrival(row.visitId!)}
              loading={isCommandPending}
              loadingLabel="Confirming"
            >
              They have arrived
            </Button>
          ) : null}

          {row.canReportNoShow && row.visitId !== null ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setReporting(true)}>
                They did not come
              </Button>
              <ConfirmAction
                open={reporting}
                onOpenChange={setReporting}
                title="Tell us they did not come?"
                // The consequence, stated before the press. A vendor no-show
                // costs the Customer nothing and buys a replacement visit — and
                // it is also a mark against a real person's standing, which is
                // why it is a confirmation rather than a one-tap.
                consequence="This visit will not cost you anything, and we will either refund its share of the plan or send another professional free. It also counts against them, so only do this if nobody turned up."
                confirmLabel="Yes, nobody came"
                pending={isCommandPending}
                onConfirm={() => {
                  setReporting(false);
                  onReportNoShow(row.visitId!);
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Who is coming, where we are allowed to say.
 *
 * Three genuinely different sentences and none of them is a placeholder: no
 * professional has taken the slot; one has and we cannot name them yet; one has
 * and here they are.
 */
function VendorLine({ row }: { row: VisitSlotRow }) {
  if (row.state === "awaiting") {
    return (
      <p className="mt-0.5 text-sm text-text-secondary">
        Nobody has taken this slot yet.
      </p>
    );
  }
  if (row.vendorName === null) {
    return (
      <p className="mt-0.5 text-sm text-text-secondary">
        We will tell you who is coming, by name, before they arrive.
      </p>
    );
  }
  return <p className="mt-0.5 text-sm text-text">{row.vendorName}</p>;
}

/** `M2-FE-424` — what this slot's money did, per the server's own split. */
function SlotMoneyLine({ row }: { row: VisitSlotRow }) {
  switch (row.money.kind) {
    case "unspent":
      return (
        <p className="mt-2 text-sm text-text-secondary">
          {row.money.amountLabel} of your plan is set aside for this slot. If
          nobody takes it, that comes back to you.
        </p>
      );
    case "committed":
      return (
        <p className="mt-2 text-sm text-text-secondary">
          {row.money.amountLabel} of your plan covers this visit. It is paid to
          the professional only once they have been and sent you an estimate.
        </p>
      );
    case "earned":
      return (
        <p className="mt-2 text-sm text-text">
          {row.money.vendorPayoutLabel ?? row.money.amountLabel} of your{" "}
          {row.money.amountLabel} goes to the professional who came and wrote your
          estimate. The rest is our fee.
        </p>
      );
    case "refunded":
      return (
        <p className="mt-2 text-sm text-text">
          {row.money.amountLabel} refunded to you. Nobody is paid for a visit that
          did not deliver an estimate.
        </p>
      );
    case "replaced":
      return (
        <p className="mt-2 text-sm text-text">
          This slot is owed a replacement visit, free. Your {row.money.amountLabel}{" "}
          stays with the plan rather than being refunded.
        </p>
      );
    default:
      return null;
  }
}
